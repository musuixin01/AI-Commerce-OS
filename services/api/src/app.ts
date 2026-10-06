import { WorkflowService } from "./workflow.service";
import { McpCredentials } from "./mcp-credentials.service";
import { KnowledgeService } from "./knowledge.service";
import { AiService } from "./ai.service";
import { CatalogTasks } from "./catalog-tasks.service";
import { AgentTasks } from "./agent-tasks.service";
import { GeneratedMediaService } from "./generated-media.service";
import { FileInterceptor } from "@nestjs/platform-express";
import { UseInterceptors, UploadedFile } from "@nestjs/common";
import express from "express";
import { resolve } from "node:path";
import "reflect-metadata";
import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  Body,
  Param,
  Module,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  MiddlewareConsumer,
  NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { randomBytes, randomUUID } from "node:crypto";
import { ZodError, z } from "zod";
import { pool, transaction } from "./db";
import { CatalogService, Subject } from "./catalog.service";
import { fail, hash, preflight } from "./domain";
type AuthRequest = Request & { actor: Subject; trace: string };
const service = new CatalogService();
const workflow = new WorkflowService();
const mcpCredentials = new McpCredentials();
const mcpRate = new Map<string, { start: number; count: number }>();
const knowledge = new KnowledgeService();
const ai = new AiService();
const catalogTasks = new CatalogTasks();
const agentTasks = new AgentTasks();
const generatedMedia = new GeneratedMediaService();
const allowedOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4100",
  ...(process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
]);
function originCheck(req: Request) {
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
    fail(403, "ORIGIN_DENIED", "来源未授权");
}
async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    req.trace = randomUUID();
    if (req.path === "/api/v1/health" || req.path === "/api/v1/auth/dev-login")
      return next();
    originCheck(req);
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = bearer || req.cookies?.commerce_session;
    if (!token) fail(401, "UNAUTHENTICATED", "请先登录");
    let r = await pool.query(
      "SELECT u.id,u.display_name AS name,m.organization_id,m.workspace_id,m.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id AND m.workspace_id=s.workspace_id WHERE s.token_hash=$1 AND s.expires_at>now() AND m.active=true",
      [hash(token)],
    );
    if (!r.rowCount && bearer?.startsWith("mcp_")) {
      r = await pool.query(
        "SELECT u.id,u.display_name AS name,m.organization_id,m.workspace_id,m.role,'' AS csrf,t.id AS token_id,t.scopes FROM mcp_tokens t JOIN users u ON u.id=t.user_id JOIN memberships m ON m.user_id=t.user_id AND m.organization_id=t.organization_id AND m.workspace_id=t.workspace_id WHERE t.token_hash=$1 AND t.active AND t.expires_at>now() AND m.active",
        [hash(bearer)],
      );
      if (r.rowCount) {
        const subject = r.rows[0];
        const scope = /^\/api\/v1\/products(?:\/[0-9a-f-]{36})?$/.test(req.path)
          ? "catalog.read"
          : /^\/api\/v1\/workflow-runs\/[0-9a-f-]{36}$/.test(req.path)
            ? "workflow.read"
            : null;
        if (req.method !== "GET" || !scope || !subject.scopes.includes(scope))
          fail(403, "MCP_SCOPE_DENIED", "MCP 凭据仅允许授权的只读查询");
        const now = Date.now();
        let rate = mcpRate.get(subject.token_id);
        if (!rate || now - rate.start >= 60000) {
          rate = { start: now, count: 0 };
          mcpRate.set(subject.token_id, rate);
        }
        if (++rate.count > 60)
          fail(429, "MCP_RATE_LIMIT", "每分钟最多 60 次查询");
        if (mcpRate.size > 10000)
          for (const [k, v] of mcpRate)
            if (now - v.start > 60000) mcpRate.delete(k);
        await transaction((c) =>
          service.audit(c, subject, "mcp.read", subject.token_id, req.trace, {
            scope,
            path: req.path,
          }),
        );
      }
    }
    if (!r.rowCount) fail(401, "SESSION_EXPIRED", "会话已过期");
    req.actor = r.rows[0];
    if (
      !bearer &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== req.actor.csrf
    )
      fail(403, "CSRF_INVALID", "会话校验失败，请重新登录");
    next();
  } catch (e) {
    next(e);
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<AuthRequest>();
    let status = 500,
      data: any = {
        code: "INTERNAL_ERROR",
        message: "服务暂时无法处理，请稍后重试",
        details: [],
        retryable: true,
      };
    if (e instanceof HttpException) {
      status = e.getStatus();
      data = e.getResponse();
    } else if (e instanceof ZodError) {
      status = 400;
      data = {
        code: "VALIDATION_ERROR",
        message: "请检查输入内容",
        details: e.issues.map((x) => ({ path: x.path, message: x.message })),
        retryable: false,
      };
    } else if (e.code === "23505") {
      status = 409;
      data = {
        code: "DUPLICATE",
        message: "SKU 或请求记录已存在",
        details: [],
        retryable: false,
      };
    } else if (e.code === "22P02") {
      status = 400;
      data = {
        code: "INVALID_ID",
        message: "标识格式无效",
        details: [],
        retryable: false,
      };
    }
    if (status === 500)
      console.error("request failed", {
        trace_id: req.trace,
        error: e.name,
        code: e.code,
      });
    res.status(status).json({ ...data, trace_id: req.trace || randomUUID() });
  }
}
@Controller("api/v1")
class ApiController {
  @Get("catalog-tasks") taskList(@Req() r: AuthRequest) {
    return catalogTasks.list(r.actor);
  }
  @Get("catalog-tasks/:id") taskGet(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return catalogTasks.get(r.actor, id);
  }
  @Get("catalog-tasks/:id/agent-tasks") agentTaskList(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return agentTasks.list(r.actor, id);
  }
  @Post("catalog-tasks/:id/agent-tasks") agentTaskCreate(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return agentTasks.create(
      r.actor,
      id,
      r.get("Idempotency-Key"),
      r.get("If-Match"),
      b,
    );
  }
  @Get("agent-tasks/:id") agentTaskGet(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return agentTasks.get(r.actor, id);
  }
  @Post("catalog-tasks") taskCreate(@Req() r: AuthRequest, @Body() b: unknown) {
    return catalogTasks.create(r.actor, r.get("Idempotency-Key"), b);
  }
  @Patch("catalog-tasks/:id") taskSave(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return catalogTasks.update(
      r.actor,
      id,
      r.get("Idempotency-Key"),
      r.get("If-Match"),
      b,
    );
  }
  @Post("catalog-tasks/:id/assets")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    }),
  )
  taskUpload(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @UploadedFile() file: any,
  ) {
    return catalogTasks.upload(
      r.actor,
      id,
      r.get("Idempotency-Key"),
      r.get("If-Match"),
      file,
    );
  }
  @Get("media-assets/:id/preview")
  async assetPreview(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const bytes = await catalogTasks.preview(r.actor, id);
    res
      .set({
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      })
      .send(bytes);
  }

  @Get("generated-media/:id/preview")
  async generatedMediaPreview(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const bytes = await generatedMedia.preview(r.actor, id);
    res
      .set({
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      })
      .send(bytes);
  }
  @Post("generated-media/:id/confirm")
  generatedMediaConfirm(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return generatedMedia.confirm(
      r.actor,
      id,
      r.get("Idempotency-Key"),
      r.get("If-Match"),
    );
  }

  @Get("workflow-runs") workflowList(@Req() r: AuthRequest) {
    return workflow.list(r.actor);
  }
  @Get("workflow-runs/:id") workflowGet(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return workflow.get(r.actor, id);
  }
  @Post("workflow-runs") workflowStart(@Req() r: AuthRequest, @Body() b: any) {
    return workflow.start(
      r.actor,
      r.get("Idempotency-Key"),
      z.string().uuid().parse(b.product_id),
      r.get("If-Match")!,
    );
  }
  @Post("workflow-runs/:id/resume") workflowResume(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    if (!r.get("Idempotency-Key"))
      fail(428, "IDEMPOTENCY_REQUIRED", "缺少请求标识");
    return workflow.resume(r.actor, id);
  }
  @Get("mcp-tokens") mcpList(@Req() r: AuthRequest) {
    return mcpCredentials.list(r.actor);
  }
  @Post("mcp-tokens") mcpCreate(@Req() r: AuthRequest, @Body() b: unknown) {
    return mcpCredentials.create(r.actor, r.get("Idempotency-Key"), b);
  }
  @Post("mcp-tokens/:id/revoke") mcpRevoke(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return mcpCredentials.revoke(r.actor, r.get("Idempotency-Key"), id);
  }

  @Get("knowledge-documents")
  knowledgeList(@Req() r: AuthRequest) {
    return knowledge.list(r.actor, String(r.query.q || ""));
  }
  @Get("knowledge-documents/:id")
  knowledgeGet(@Req() r: AuthRequest, @Param("id") id: string) {
    return knowledge.get(r.actor, id);
  }
  @Post("knowledge-documents")
  knowledgeCreate(@Req() r: AuthRequest, @Body() b: unknown) {
    return knowledge.create(r.actor, r.get("Idempotency-Key"), b);
  }
  @Post("knowledge-documents/:id/publish")
  knowledgePublish(@Req() r: AuthRequest, @Param("id") id: string) {
    return knowledge.publish(
      r.actor,
      r.get("Idempotency-Key"),
      id,
      r.get("If-Match")!,
    );
  }
  @Get("ai-runs")
  aiList(@Req() r: AuthRequest) {
    return ai.list(r.actor);
  }
  @Post("ai-runs")
  aiGenerate(@Req() r: AuthRequest, @Body() b: unknown) {
    return ai.generate(r.actor, r.get("Idempotency-Key"), b);
  }
  @Get("capabilities")
  capabilities() {
    const fieldConfigured = Boolean(process.env.OPENAI_API_KEY && process.env.AI_MODEL);
    return {
      ai_configured: fieldConfigured,
      catalog_generation: {
        field_draft: fieldConfigured ? "available" : "needs_model_configuration",
        image_generation: process.env.OPENAI_API_KEY && process.env.AI_IMAGE_MODEL
          ? "available"
          : "not_connected",
        cost_basis: "configured_reserve_estimate",
      },
      knowledge: "text",
      publication: "manual_export",
    };
  }

  @Get("health") async health() {
    await pool.query("SELECT 1");
    return { status: "ok", mode: process.env.APP_MODE, version: "0.1.0" };
  }
  @Post("auth/dev-login") async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: any,
  ) {
    if (
      process.env.APP_MODE !== "development" ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress || "",
      )
    )
      fail(404, "NOT_FOUND", "接口不存在");
    originCheck(req);
    const b = z
      .object({
        role: z.enum(["ops", "owner"]),
        tenant: z.enum(["1", "2"]).default("1"),
        client: z.enum(["web", "native"]).default("web"),
      })
      .strict()
      .parse(body);
    const user =
      "30000000-0000-4000-8000-0000000000" +
      b.tenant +
      (b.role === "ops" ? "1" : "2");
    const org = "10000000-0000-4000-8000-00000000000" + b.tenant,
      ws = "20000000-0000-4000-8000-00000000000" + b.tenant;
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,organization_id,workspace_id,csrf,expires_at)SELECT $1,$2,$3,$4,$5,now()+interval '8 hours' WHERE EXISTS(SELECT 1 FROM memberships WHERE user_id=$2 AND organization_id=$3 AND workspace_id=$4 AND active=true)",
      [hash(token), user, org, ws, csrf],
    );
    res.cookie("commerce_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/api",
      maxAge: 8 * 3600000,
    });
    return b.client === "native" ? { csrf, token } : { csrf };
  }
  @Get("me") me(@Req() r: AuthRequest) {
    return r.actor;
  }
  @Post("auth/logout") async logout(
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      hash(
        r.headers.authorization?.startsWith("Bearer ")
          ? r.headers.authorization.slice(7)
          : r.cookies.commerce_session,
      ),
    ]);
    res.clearCookie("commerce_session", { path: "/api" });
    return { ok: true };
  }
  @Get("products") list(@Req() r: AuthRequest) {
    return service.list(r.actor, r.query);
  }
  @Get("products/:id") get(@Req() r: AuthRequest, @Param("id") id: string) {
    return service.get(pool, r.actor, id);
  }
  @Post("products") create(@Req() r: AuthRequest, @Body() b: any) {
    return service.save(r.actor, r.get("Idempotency-Key"), b);
  }
  @Patch("products/:id") update(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return service.save(
      r.actor,
      r.get("Idempotency-Key"),
      b,
      id,
      r.get("If-Match"),
    );
  }
  @Post("products/:id/validate") async validate(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    const p = await service.get(pool, r.actor, id);
    return { issues: preflight(p), version: p.version, mode: "manual_export" };
  }
  @Post("approvals") request(@Req() r: AuthRequest, @Body() b: any) {
    const id = z.string().uuid().parse(b.product_id);
    return service.request(
      r.actor,
      r.get("Idempotency-Key"),
      id,
      r.get("If-Match")!,
    );
  }
  @Get("approvals") approvals(@Req() r: AuthRequest) {
    return service.approvals(r.actor);
  }
  @Post("approvals/:id/decisions") decide(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: any,
  ) {
    return service.decide(
      r.actor,
      r.get("Idempotency-Key"),
      id,
      r.get("If-Match")!,
      b.decision,
    );
  }
  @Post("products/:id/export") export(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return service.export(
      r.actor,
      r.get("Idempotency-Key"),
      id,
      r.get("If-Match")!,
    );
  }
  @Get("packages") async packages(@Req() r: AuthRequest) {
    return (
      await pool.query(
        "SELECT k.* FROM publication_packages k JOIN products p ON p.id=k.product_id AND p.organization_id=k.organization_id WHERE p.organization_id=$1 AND p.workspace_id=$2 ORDER BY k.created_at DESC LIMIT 100",
        [r.actor.organization_id, r.actor.workspace_id],
      )
    ).rows;
  }
  @Get("audit-entries") async audit(@Req() r: AuthRequest) {
    if (r.actor.role !== "owner") fail(403, "FORBIDDEN", "需要审计权限");
    return (
      await pool.query(
        "SELECT action,resource_id,trace_id,created_at FROM audit_entries WHERE organization_id=$1 AND workspace_id=$2 ORDER BY created_at DESC LIMIT 100",
        [r.actor.organization_id, r.actor.workspace_id],
      )
    ).rows;
  }
}
@Module({ controllers: [ApiController] })
class AppModule implements NestModule {
  configure(c: MiddlewareConsumer) {
    c.apply(authenticate).forRoutes(ApiController);
  }
}
export async function createApp() {
  if (process.env.APP_MODE !== "development")
    throw new Error(
      "Production identity provider is not configured. Refusing to start.",
    );
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
  });
  app.use(cookieParser());
  app.use(express.static(resolve(process.cwd(), "../../apps/web/dist")));
  app.use(express.static(resolve(process.cwd(), "apps/web/dist")));
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  return app;
}
