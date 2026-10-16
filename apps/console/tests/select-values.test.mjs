import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadSelect() {
  const compiled = ts.transpileModule(
    readFileSync(new URL("../src/components/ui/select.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  const cjsModule = { exports: {} };
  const element = (type, props) => ({ type, props });
  const dependencies = {
    react: {},
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "radix-ui": { Select: { Root: "select-root" } },
    "@/src/lib/utils": {},
    "lucide-react": {},
  };
  vm.runInNewContext(compiled, {
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return cjsModule.exports.Select;
}

test("select ignores empty native synchronization events when saved values load", () => {
  const Select = loadSelect();
  let language = "hi";
  let dependentModelsCleared = false;
  const select = Select({ value: language, onValueChange: (value) => {
    language = value;
    dependentModelsCleared = true;
  } });

  // Radix emits this while the hidden native select has no registered options.
  select.props.onValueChange("");

  assert.equal(language, "hi");
  assert.equal(dependentModelsCleared, false);
  assert.equal(select.props.value, "hi");
});

test("select forwards user choices including the unassigned routing option", () => {
  const values = [];
  const select = loadSelect()({ value: "hi", onValueChange: (value) => values.push(value) });
  select.props.onValueChange("en");
  select.props.onValueChange("__unassigned__");
  assert.deepEqual(values, ["en", "__unassigned__"]);
});

test("select still accepts an explicitly cleared controlled value", () => {
  const select = loadSelect()({ value: "" });
  assert.equal(select.props.value, "");
});
