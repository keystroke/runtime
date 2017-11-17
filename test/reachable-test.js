import tape from "tape-await";
import {runtime as createRuntime} from "../";
import "./requestAnimationFrame";
import valueof from "./valueof";

tape("variable.define recomputes reachability as expected", async test => {
  const runtime = createRuntime();
  const module = runtime.module();
  const quux = module.variable(false).define("quux", [], 42);
  const baz = module.variable(false).define("baz", ["quux"], quux => `baz-${quux}`);
  const bar = module.variable(false).define("bar", ["quux"], quux => `bar-${quux}`);
  const foo = module.variable().define("foo", ["bar", "baz", "quux"], (bar, baz, quux) => bar + baz + quux);
  await new Promise(setImmediate);
  test.equal(quux._reachable, true);
  test.equal(baz._reachable, true);
  test.equal(bar._reachable, true);
  test.equal(foo._reachable, true);
  foo.define("foo", "foo");
  await new Promise(setImmediate);
  test.equal(quux._reachable, false);
  test.equal(baz._reachable, false);
  test.equal(bar._reachable, false);
  test.equal(foo._reachable, true);
});

tape("variable.define terminates previously reachable generators", async test => {
  let returned = false;
  const runtime = createRuntime();
  const module = runtime.module();
  const bar = module.variable(false).define("bar", [], function* () { try { while (true) yield 1; } finally { returned = true; }});
  const foo = module.variable().define("foo", ["bar"], bar => bar);
  await new Promise(setImmediate);
  test.equal(bar._reachable, true);
  test.equal(foo._reachable, true);
  foo.define("foo", "foo");
  await new Promise(setImmediate);
  test.equal(bar._reachable, false);
  test.equal(bar._generator, undefined);
  test.equal(foo._reachable, true);
  test.equal(returned, true);
});

tape("variable.define does not terminate reachable generators", async test => {
  let returned = false;
  const runtime = createRuntime();
  const module = runtime.module();
  const bar = module.variable(false).define("bar", [], function* () { try { while (true) yield 1; } finally { returned = true; }});
  const baz = module.variable().define("baz", ["bar"], bar => bar);
  const foo = module.variable().define("foo", ["bar"], bar => bar);
  await new Promise(setImmediate);
  test.equal(baz._reachable, true);
  test.equal(bar._reachable, true);
  test.equal(foo._reachable, true);
  foo.define("foo", "foo");
  await new Promise(setImmediate);
  test.equal(baz._reachable, true);
  test.equal(bar._reachable, true);
  test.equal(foo._reachable, true);
  test.equal(returned, false);
  bar._generator.return();
  test.equal(returned, true);
});

tape("variable.define correctly detects reachability for unreachable cycles", async test => {
  let returned = false;
  const runtime = createRuntime();
  const module = runtime.module();
  const bar = module.variable(false).define("bar", ["baz"], baz => `bar-${baz}`);
  const baz = module.variable(false).define("baz", ["quux"], quux => `baz-${quux}`);
  const quux = module.variable(false).define("quux", ["zapp"], function* (zapp) { try { while (true) yield `quux-${zapp}`; } finally { returned = true; }});
  const zapp = module.variable(false).define("zapp", ["bar"], bar => `zaap-${bar}`);
  await new Promise(setImmediate);
  test.equal(bar._reachable, false);
  test.equal(baz._reachable, false);
  test.equal(quux._reachable, false);
  test.equal(zapp._reachable, false);
  test.deepEqual(await valueof(bar), {error: "circular definition"});
  test.deepEqual(await valueof(baz), {error: "circular definition"});
  test.deepEqual(await valueof(quux), {error: "circular definition"});
  test.deepEqual(await valueof(zapp), {error: "circular definition"});
  const foo = module.variable().define("foo", ["bar"], bar => bar);
  await new Promise(setImmediate);
  test.equal(foo._reachable, true);
  test.equal(bar._reachable, true);
  test.equal(baz._reachable, true);
  test.equal(quux._reachable, true);
  test.equal(zapp._reachable, true);
  test.deepEqual(await valueof(foo), {error: "circular definition"}); // Variables that depend on cycles are themselves circular.
  foo.define("foo", [], "foo");
  await new Promise(setImmediate);
  test.equal(foo._reachable, true);
  test.equal(bar._reachable, false);
  test.equal(baz._reachable, false);
  test.equal(quux._reachable, false);
  test.equal(zapp._reachable, false);
  test.deepEqual(await valueof(foo), {value: "foo"});
  test.deepEqual(await valueof(bar), {error: "circular definition"});
  test.equal(returned, false); // Generator is never finalized because it has never run.
});
