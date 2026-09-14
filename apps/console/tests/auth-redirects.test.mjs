import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

const linksSource = compile("../src/lib/links.ts");
const registerSource = compile(
  "../src/components/forms/auth/register-form.tsx",
);

test("signup verification returns to the console when the auth API is on another origin", async () => {
  for (const [configuredOrigin, browserOrigin, expectedCallback] of [
    [
      "https://app.quickvoice.co",
      "https://preview.quickvoice.co",
      "https://app.quickvoice.co/login",
    ],
    [
      "https://app.quickvoice.co/",
      "https://app.quickvoice.co",
      "https://app.quickvoice.co/login",
    ],
    [undefined, "http://localhost:3000", "http://localhost:3000/login"],
  ]) {
    const links = { exports: {} };
    vm.runInNewContext(linksSource, {
      exports: links.exports,
      process: { env: { NEXT_PUBLIC_CONSOLE_URL: configuredOrigin } },
    });

    let submit;
    let signupBody;
    let nextPage;
    const noop = () => {};
    const mocks = {
      react: { useState: () => [false, noop] },
      "react/jsx-runtime": { jsx: noop, jsxs: noop },
      "next/navigation": {
        useRouter: () => ({
          push: (path) => {
            nextPage = path;
          },
        }),
      },
      "react-hook-form": {
        useForm: () => ({
          handleSubmit: (handler) => {
            submit = handler;
          },
        }),
      },
      "@hookform/resolvers/zod": { zodResolver: noop },
      sonner: {
        toast: {
          success: noop,
          error: (error) => {
            throw new Error(error);
          },
        },
      },
      "@/src/lib/links": links.exports,
      "@/src/lib/auth-client": {
        authClient: {
          signUp: {
            email: async (body) => {
              signupBody = body;
              return {};
            },
          },
        },
      },
    };
    const component = { exports: {} };
    vm.runInNewContext(registerSource, {
      exports: component.exports,
      require: (name) => mocks[name] ?? {},
      window: { location: { origin: browserOrigin } },
    });

    component.exports.RegisterForm();
    await submit({
      name: "QA Owner",
      email: "qa@example.com",
      password: "test-only-password",
    });

    assert.equal(signupBody.callbackURL, expectedCallback);
    const verificationUrl = new URL(
      "https://api.quickvoice.co/api/v1/auth/verify-email",
    );
    verificationUrl.searchParams.set("callbackURL", signupBody.callbackURL);
    assert.equal(
      new URL(verificationUrl.searchParams.get("callbackURL"), verificationUrl)
        .href,
      expectedCallback,
    );
    assert.equal(nextPage, "/verify");
  }
});
