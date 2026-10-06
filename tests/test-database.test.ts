import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTestDatabase } from "../scripts/test-database";
test("test database guard rejects demo, production, remote and connection overrides", () => {
  const valid = {
    COMMERCE_TEST_MODE: "1",
    DATABASE_URL:
      "postgresql://user:unused@127.0.0.1:55439/commerce_test_0123456789abcdef",
  };
  assert.doesNotThrow(() => assertTestDatabase(valid));
  for (const patch of [
    { DATABASE_URL: "postgresql://localhost/commerce" },
    { DATABASE_URL: "postgresql://localhost/commerce_test" },
    { DATABASE_URL: "postgresql://remote/commerce_test_0123456789abcdef" },
    { DATABASE_URL: valid.DATABASE_URL + "?host=remote" },
    { COMMERCE_TEST_MODE: "" },
    { NODE_ENV: "production" },
    { PGOPTIONS: "-c search_path=public" },
  ])
    assert.throws(() => assertTestDatabase({ ...valid, ...patch }));
});
