/** Fail closed before opening a database connection in test processes. */
export function assertTestDatabase(env: NodeJS.ProcessEnv = process.env) {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL || "");
  } catch {
    throw new Error(
      "Tests require an isolated database; run npm test or npm run test:e2e",
    );
  }
  if (
    env.COMMERCE_TEST_MODE !== "1" ||
    env.NODE_ENV === "production" ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/commerce_test_[a-f0-9]{16}$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    env.PGOPTIONS
  ) {
    throw new Error("Refusing non-isolated test database");
  }
}
