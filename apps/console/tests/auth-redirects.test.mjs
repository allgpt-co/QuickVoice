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

test("signup rejects duplicate emails and new-account verification returns to the console", async () => {
  for (const [configuredOrigin, browserOrigin, expectedCallback, invitationId = "", responseKind = "new"] of [
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
    [undefined, "http://localhost:3000", "http://localhost:3000/login", "", "duplicate"],
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
    const notices = [];
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
          success: (message) => notices.push({ type: "success", message }),
          message: (message) => notices.push({ type: "message", message }),
          error: (message) => notices.push({ type: "error", message }),
        },
      },
      "@/src/lib/links": links.exports,
      "@/src/lib/auth-client": {
        authClient: {
          signUp: {
            email: async (body) => {
              signupBody = body;
              if (responseKind === "duplicate") {
                return { error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "This email is already registered. Please sign in or reset your password." } };
              }
              return { data: { token: null, user: { id: "new-user", email: body.email, emailVerified: false } } };
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
    assert.equal(notices.length, 1);
    if (responseKind === "duplicate") {
      assert.equal(nextPage, undefined, "Duplicate signup must stay on registration");
      assert.equal(notices[0].type, "error");
      assert.match(notices[0].message, /already registered.*sign in.*reset your password/i);
      continue;
    }
    assert.equal(nextPage, links.exports.invitationPath(invitationId, "/verify"));
    assert.equal(notices[0].type, "message");
    assert.doesNotMatch(notices[0].message, /created|signed up|successfully|sent/i);
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
    elements.find(({ props }) => props?.name === "password" && props.render).props.render({ field: {} });
    assert.ok(elements.some(({ props }) => props?.href === links.exports.invitationPath(invitationId, "/forgot-password")));
    elements.length = 0;
    loadComponent("../src/components/oauth-buttons.tsx").default({ invitationId });
    await elements.find(({ props }) => props?.onClick).props.onClick();
    assert.equal(socialBody.callbackURL, `https://app.quickvoice.co${destination}`);
    assert.equal(socialBody.newUserCallbackURL, `https://app.quickvoice.co${invitationId ? destination : "/orgs"}`);
    assert.equal(socialBody.errorCallbackURL, `https://app.quickvoice.co${links.exports.invitationPath(invitationId, "/login")}`);
  }
});

test("signup confirmation offers recovery without claiming an account or email was created", async () => {
  const links = { exports: {} };
  vm.runInNewContext(linksSource, { exports: links.exports, process: { env: {} } });
  for (const invitationId of [undefined, "invite&role=owner", ["ambiguous", "id"]]) {
    const elements = [];
    const jsx = (type, props) => { elements.push({ type, props }); return { type, props }; };
    const component = { exports: {} };
    vm.runInNewContext(compile("../src/app/(auth)/verify/page.tsx"), {
      exports: component.exports,
      require: (name) => ({
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "@/src/lib/links": links.exports,
      })[name] ?? {},
    });
    await component.exports.default({ searchParams: Promise.resolve({ invitationId }) });
    const id = typeof invitationId === "string" ? invitationId : "";
    assert.deepEqual(elements.filter(({ props }) => props?.href).map(({ props }) => props.href), [
      links.exports.invitationPath(id, "/login"),
      links.exports.invitationPath(id, "/forgot-password"),
    ]);
    const copy = JSON.stringify(elements);
    assert.doesNotMatch(copy, /we.{0,10}sent|account created|signed up successfully/i);
    assert.match(copy, /If this email can be used for a new account/);
    assert.match(copy, /Already have an account/);
  }
});

test("password recovery preserves invitation IDs through canonical reset links, errors, and login", async () => {
  const links = { exports: {} };
  vm.runInNewContext(linksSource, {
    exports: links.exports,
    process: { env: { NEXT_PUBLIC_CONSOLE_URL: "https://app.quickvoice.co/" } },
  });
  for (const invitationId of ["", "invite&role=owner", "https://untrusted.example/path"]) {
    let submit, resetRequest, nextPage;
    const notices = [], elements = [];
    const noop = () => {};
    const jsx = (type, props) => { elements.push({ type, props }); return { type, props }; };
    const mocks = {
      react: { useState: () => [false, noop], useEffect: noop },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/navigation": {
        useRouter: () => ({ push: (path) => { nextPage = path; } }),
        useSearchParams: () => new URLSearchParams({ invitationId, token: "test-reset-token" }),
      },
      "react-hook-form": { useForm: () => ({ handleSubmit: (handler) => { submit = handler; } }) },
      "@hookform/resolvers/zod": { zodResolver: noop },
      sonner: { toast: { success: noop, message: (message) => notices.push(message), error: (message) => { throw new Error(message); } } },
      "@/src/lib/links": links.exports,
      "@/src/lib/auth-client": { authClient: {
        requestPasswordReset: async (body) => { resetRequest = body; return {}; },
        resetPassword: async () => ({}),
      } },
    };
    function render(path) {
      elements.length = 0;
      const component = { exports: {} };
      vm.runInNewContext(compile(path), {
        exports: component.exports,
        require: (name) => mocks[name] ?? {},
        window: { location: { origin: "https://preview.quickvoice.co" } },
      });
      component.exports.default();
      elements.find(({ type }) => typeof type === "function").type();
    }
    render("../src/app/(auth)/forgot-password/page.tsx");
    await submit({ email: "qa@example.com" });
    assert.equal(resetRequest.redirectTo, `https://app.quickvoice.co${links.exports.invitationPath(invitationId, "/reset-password")}`);
    assert.equal(notices.length, 1);
    assert.doesNotMatch(notices[0], /sent|successfully/i);
    assert.ok(elements.some(({ props }) => props?.href === links.exports.invitationPath(invitationId, "/login")));
    render("../src/app/(auth)/reset-password/page.tsx");
    await submit({ token: "test-reset-token", newPassword: "test-only-password" });
    assert.equal(nextPage, links.exports.invitationPath(invitationId, "/login"));
    mocks["next/navigation"].useSearchParams = () => new URLSearchParams({ invitationId, error: "INVALID_TOKEN" });
    render("../src/app/(auth)/reset-password/page.tsx");
    assert.ok(elements.some(({ props }) => props?.href === links.exports.invitationPath(invitationId, "/forgot-password")));
  }
});
