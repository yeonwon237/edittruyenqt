import test from "node:test";
import assert from "node:assert/strict";
import { highlightTerms } from "../src/lib/highlight.js";

test("Vietnamese glossary terms highlight whole words only", () => {
  const terms = [
    { source_term: "chị", translation: "ta" },
    { source_term: "em", translation: "ngươi" },
  ];
  const nodes = highlightTerms("chịu xem chị và em", terms);
  const highlighted = nodes.filter((node) => typeof node !== "string").map((node) => node.props.children);
  assert.deepEqual(highlighted, ["chị", "em"]);
  assert.equal(nodes.map((node) => typeof node === "string" ? node : node.props.children).join(""), "chịu xem chị và em");
});

test("Chinese glossary terms still highlight inside continuous Han text", () => {
  const nodes = highlightTerms("她叫姐姐来了", [{ source_term: "姐姐", translation: "chị" }]);
  assert.deepEqual(nodes.filter((node) => typeof node !== "string").map((node) => node.props.children), ["姐姐"]);
});
