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
  for (const [configuredOrigin, browserOrigin, expectedCallback, invitationId = ""] of [
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
    ["https://app.quickvoice.co/", "https://preview.quickvoice.co", "https://app.quickvoice.co/accept-invitation?invitationId=invite%26role%3Downer", "invite&role=owner"],
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

    component.exports.RegisterForm({ invitationId });
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

test("invited email and Google sign-in preserve the invitation and use fixed internal paths", async () => {
  const links = { exports: {} };
  vm.runInNewContext(linksSource, {
    exports: links.exports,
    process: { env: { NEXT_PUBLIC_CONSOLE_URL: "https://app.quickvoice.co/" } },
  });
  for (const invitationId of ["", "invite&role=owner", "https://untrusted.example/path"]) {
    let submit;
    let nextPage;
    let socialBody;
    const elements = [];
    const noop = () => {};
    const signIn = {
      email: async (body) => body.fetchOptions.onSuccess(),
      social: async (body) => { socialBody = body; },
    };
    const mocks = {
      react: { useState: () => [false, noop] },
      "react/jsx-runtime": {
        jsx: (type, props) => { elements.push({ type, props }); return { type, props }; },
        jsxs: (type, props) => { elements.push({ type, props }); return { type, props }; },
      },
      "next/navigation": { useRouter: () => ({ push: (path) => { nextPage = path; } }) },
      "react-hook-form": { useForm: () => ({ handleSubmit: (handler) => { submit = handler; } }) },
      "@hookform/resolvers/zod": { zodResolver: noop },
      sonner: { toast: { success: noop, error: (message) => { throw new Error(message); } } },
      "@/src/lib/links": links.exports,
      "@/src/lib/auth-client": { authClient: { signIn }, signIn },
    };
    function loadComponent(path) {
      const component = { exports: {} };
      vm.runInNewContext(compile(path), {
        exports: component.exports,
        require: (name) => mocks[name] ?? {},
        window: { location: { origin: "https://preview.quickvoice.co" } },
      });
      return component.exports;
    }
    loadComponent("../src/components/forms/auth/login-form.tsx").LoginForm({ invitationId });
    await submit({ email: "qa@example.com", password: "test-only-password", remember: false });
    const destination = invitationId ? `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}` : "/dashboard";
    assert.equal(nextPage, destination);
    assert.ok(elements.some(({ props }) => props?.href === links.exports.invitationPath(invitationId, "/register")));
    elements.length = 0;
    loadComponent("../src/components/oauth-buttons.tsx").default({ invitationId });
    await elements.find(({ props }) => props?.onClick).props.onClick();
    assert.equal(socialBody.callbackURL, `https://app.quickvoice.co${destination}`);
    assert.equal(socialBody.newUserCallbackURL, `https://app.quickvoice.co${invitationId ? destination : "/orgs"}`);
    assert.equal(socialBody.errorCallbackURL, `https://app.quickvoice.co${links.exports.invitationPath(invitationId, "/login")}`);
  }
});
