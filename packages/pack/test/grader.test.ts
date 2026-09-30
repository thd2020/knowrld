// Unit tests for the declarative check kinds, each on a small document.
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { accessibleName, computedRole, gradeDocument, gradeSite, isValidDatetime, type GradedPage } from "../src/dom-grader.ts";
import { DomCheck, ProblemFile } from "../src/schema.ts";
import { validateProblem } from "../src/validate.ts";
import { fixtureCode } from "../src/problem.ts";

const doc = (body: string, head = "") => new JSDOM(`<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`).window.document;
const check = (c: Record<string, unknown>) => DomCheck.parse({ id: "c", says: "c", ...c });
const pass = (d: Document, c: Record<string, unknown>) => gradeDocument(d, [check(c)])[0]!;

describe("roles and accessible names", () => {
  it("maps landmark elements to roles, scoped by their ancestors", () => {
    const d = doc(`<header id="h"></header><nav id="n"></nav><main id="m"><aside id="a1"></aside><article><header id="h2"></header><footer id="f2"></footer><aside id="a2"></aside><aside id="a3" aria-label="Notes"></aside></article></main><section id="s1"></section><section id="s2" aria-labelledby="t"><h2 id="t">Tides</h2></section><footer id="f"></footer><search id="q"></search>`);
    const role = (id: string) => computedRole(d.getElementById(id)!);
    expect([role("h"), role("n"), role("m"), role("f"), role("q")]).toEqual(["banner", "navigation", "main", "contentinfo", "search"]);
    expect([role("h2"), role("f2")]).toEqual(["generic", "generic"]);
    expect([role("a1"), role("a2"), role("a3")]).toEqual(["complementary", "generic", "complementary"]);
    expect([role("s1"), role("s2")]).toEqual(["generic", "region"]);
  });

  it("lets an explicit role win and treats alt=\"\" as decorative", () => {
    const d = doc(`<div id="d" role="button">Go</div><img id="i" src="x.png" alt=""><img id="j" src="x.png" alt="A heron">`);
    expect(computedRole(d.getElementById("d")!)).toBe("button");
    expect(computedRole(d.getElementById("i")!)).toBe("none");
    expect(computedRole(d.getElementById("j")!)).toBe("img");
  });

  it("gives button-like inputs the button role and a name from their value", () => {
    const d = doc(`<input id="b" type="button" value="Zoom in"><input id="s" type="submit"><input id="i" type="image" alt="Search" src="s.png"><input id="t">`);
    const el = (id: string) => d.getElementById(id)!;
    expect(["b", "s", "i", "t"].map((id) => computedRole(el(id)))).toEqual(["button", "button", "button", "textbox"]);
    expect(["b", "s", "i"].map((id) => accessibleName(el(id)))).toEqual(["Zoom in", "Submit", "Search"]);
  });

  it("names links from their content, including image alt text, and landmarks only from labels", () => {
    const d = doc(`<a id="a" href="/"><img src="logo.png" alt="Harbour home"></a><a id="b" href="/x"> Read <span>more</span> </a><a id="c" href="/y" aria-label="Tide tables"><img src="t.png" alt="x"></a><nav id="n"><a href="/">Home</a></nav><nav id="m" aria-labelledby="mh"><h2 id="mh">Site</h2></nav><a id="e" href="/z"><img src="e.png"></a>`);
    const name = (id: string) => accessibleName(d.getElementById(id)!);
    expect([name("a"), name("b"), name("c")]).toEqual(["Harbour home", "Read more", "Tide tables"]);
    expect([name("n"), name("m"), name("e")]).toEqual(["", "Site", ""]);
  });

  it("selects by role and counts landmarks", () => {
    const d = doc(`<header></header><main><article><header></header></article></main><footer></footer>`);
    expect(pass(d, { role: "banner", count: { min: 1, max: 1 } }).pass).toBe(true);
    expect(pass(d, { role: "complementary", count: { min: 1 } }).pass).toBe(false);
    expect(pass(d, { selector: "header", role: "banner", count: { min: 2 } }).pass).toBe(false);
  });

  it("treats count max 0 as \"no such element\"", () => {
    const d = doc(`<p>x</p>`);
    expect(pass(d, { selector: "blink", count: { max: 0 } }).pass).toBe(true);
    expect(pass(d, { selector: "p", count: { max: 0 } }).pass).toBe(false);
  });

  it("checks accessible names", () => {
    const d = doc(`<button> </button><button>Save</button>`);
    expect(pass(d, { selector: "button", every: true, name: { matches: "\\S" } }).detail).toMatch(/accessible name/);
  });
});

describe("datetime", () => {
  it("accepts every format in the Learn passage and the reference table", () => {
    for (const v of ["2016-01-20", "2016-01", "01-20", "19:30", "19:30:01.856", "2016-01-20T19:30", "2016-01-20T19:30+01:00", "2016-W04", "2016", "2016-01-20 19:30Z", "--02-29", "PT1H30M", "1h 30m", "+05:30", "2020-W53"]) {
      expect(isValidDatetime(v), v).toBe(true);
    }
  });
  it("rejects human dates and impossible values", () => {
    for (const v of ["20 January 2016", "2016-13-01", "2015-02-29", "2016-1-20", "24:00", "19.30", "2016-W54", "2019-W53", "0000", "P", "PT", "", "01/20/16"]) {
      expect(isValidDatetime(v), v).toBe(false);
    }
  });
  it("uses the text when there is no datetime attribute, and then allows no child elements", () => {
    const d = doc(`<time>2016-01-20</time><time><b>2016-01-20</b></time><time datetime="Jan 20">x</time>`);
    expect(pass(d, { selector: "time", first: true, datetime: true }).pass).toBe(true);
    expect(pass(d, { selector: "time", every: true, datetime: true }).detail).toMatch(/may not contain elements/);
  });
});

describe("heading outline", () => {
  it("passes an unbroken hierarchy and returning to a higher level", () => {
    expect(pass(doc("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><h3>e</h3>"), { selector: "body", outline: { start: 1 } }).pass).toBe(true);
  });
  it("fails a skipped level and a wrong first level", () => {
    expect(pass(doc("<h1>a</h1><h3>b</h3>"), { selector: "body", outline: {} }).detail).toMatch(/skipping a level/);
    expect(pass(doc("<h2>a</h2><h3>b</h3>"), { selector: "body", outline: { start: 1 } }).detail).toMatch(/not h1/);
  });
  it("ignores hidden headings", () => {
    expect(pass(doc("<h1>a</h1><h3 hidden>b</h3><h2>c</h2>"), { selector: "body", outline: { start: 1 } }).pass).toBe(true);
  });
});

describe("sibling order", () => {
  const d = doc(`<dl><dt>chickpea</dt><dt>garbanzo</dt><dd>A legume.</dd><dt>tahini</dt><dd>Paste.</dd><dd>Also a dip.</dd></dl><p>a<br><br>b</p><p>c<br>d<br>e</p>`);
  it("follows a sequence of siblings with text tests", () => {
    expect(pass(d, { selector: "dt", text: { matches: "chickpea" }, next: [{ is: "dt", text: { matches: "garbanzo" } }, { is: "dd" }] }).pass).toBe(true);
    expect(pass(d, { selector: "dt", text: { matches: "tahini" }, next: [{ is: "dd" }, { is: "dd" }, { is: "dd", absent: true }] }).pass).toBe(true);
    expect(pass(d, { selector: "dt", text: { matches: "garbanzo" }, next: [{ is: "dt" }] }).pass).toBe(false);
  });
  it("sees text between elements, which CSS sibling combinators ignore", () => {
    expect(pass(d, { selector: "p:first-of-type br", every: true, next: [{ is: "br", absent: true }] }).pass).toBe(false);
    expect(pass(d, { selector: "p:last-of-type br", every: true, next: [{ is: "br", absent: true }] }).pass).toBe(true);
  });
  it("checks document order with precedes", () => {
    const e = doc(`<aside>side</aside><main><article>post</article></main>`);
    expect(pass(e, { selector: "article", precedes: "aside" }).detail).toMatch(/comes after <aside>/);
    expect(pass(e, { selector: "aside", precedes: "footer" }).pass).toBe(true);
  });
  it("restricts to the first match with first", () => {
    const e = doc(`<a href="#main">Skip</a><nav><a href="/">Home</a></nav><main id="main"></main>`);
    expect(pass(e, { selector: "a[href], button", first: true, attr: { name: "href", equals: "#main" } }).pass).toBe(true);
    expect(pass(doc(`<nav><a href="/">Home</a></nav><a href="#main">Skip</a>`), { selector: "a[href]", first: true, attr: { name: "href", equals: "#main" } }).pass).toBe(false);
  });
  it("tests an element's own text only", () => {
    const e = doc(`<div><p>wrapped</p></div><section>loose <p>x</p></section>`);
    expect(pass(e, { selector: "div", text: { own: true, not: "\\S" } }).pass).toBe(true);
    expect(pass(e, { selector: "section", text: { own: true, not: "\\S" } }).pass).toBe(false);
  });
});

describe("ids and links", () => {
  it("finds duplicate ids", () => {
    expect(pass(doc(`<h2 id="a"></h2><h2 id="a"></h2>`), { selector: "[id]", unique: "id", count: { min: 0 } }).detail).toMatch(/id="a" appears more than once/);
    expect(pass(doc(`<h2 id="a"></h2><h2 id="b"></h2>`), { selector: "[id]", unique: "id", count: { min: 0 } }).pass).toBe(true);
  });

  it("resolves same-page fragments, relative and root-relative paths against the page's path", () => {
    const d = new JSDOM(`<!doctype html><body><a id="a" href="#team">x</a><a id="b" href="../pdfs/brief.pdf">x</a><a id="c" href="/pdfs/brief.pdf">x</a><a id="d" href="pdfs/brief.pdf">x</a><a id="e" href="#nope">x</a><a id="f" href="../about/#history">x</a><a id="g" href="https://example.org/">x</a><a id="h" href="#">x</a><a id="i" href="../about">x</a><h2 id="team">Team</h2></body>`).window.document;
    const files = [{ path: "/pdfs/brief.pdf" }, { path: "/about/index.html", ids: ["history"] }];
    const r = (id: string) => gradeDocument(d, [check({ selector: `#${id}`, resolves: true })], { path: "/projects/index.html", files })[0]!;
    expect(["a", "b", "c", "f", "i"].map((i) => r(i).pass)).toEqual([true, true, true, true, true]);
    expect(r("d").detail).toMatch(/\/projects\/pdfs\/brief.pdf, which is not on the site/);
    expect(r("e").detail).toMatch(/no element has id="nope"/);
    expect(r("g").detail).toMatch(/leads off this site/);
    expect(r("h").detail).toMatch(/empty fragment/);
  });

  it("resolves links between pages of a site, including fragments on the other page", () => {
    const a = new JSDOM(`<!doctype html><body><a href="letter.html#dates">x</a><a href="letter.html#gone">y</a></body>`).window.document;
    const b = new JSDOM(`<!doctype html><body><h2 id="dates">Dates</h2></body>`).window.document;
    const pages: GradedPage[] = [{ id: "home", path: "/index.html", doc: a }, { id: "letter", path: "/letter.html", doc: b }];
    const [ok, bad] = gradeSite(pages, [
      check({ id: "ok", selector: "a", first: true, resolves: true, pages: ["home"] }),
      check({ id: "bad", selector: "a", every: true, resolves: true, pages: ["home"] }),
    ]);
    expect(ok!.pass).toBe(true);
    expect(bad!.detail).toMatch(/no element has id="gone" on \/letter.html/);
  });
});

describe("link targets", () => {
  const home = new JSDOM(`<!doctype html><body><a href="#main">Skip</a><a href="#nav">Skip</a><a href="letter.html">Letter</a><nav id="nav"></nav><main id="main"></main></body>`).window.document;
  const letter = new JSDOM(`<!doctype html><body></body>`).window.document;
  const pages: GradedPage[] = [{ id: "home", path: "/index.html", doc: home }, { id: "letter", path: "/letter.html", doc: letter }];
  it("checks that a fragment leads to an element of the right kind", () => {
    const [a, b] = gradeSite(pages, [
      check({ id: "a", selector: "a[href='#main']", resolves: { to: "main" }, pages: ["home"] }),
      check({ id: "b", selector: "a[href='#nav']", resolves: { to: "main" }, pages: ["home"] }),
    ]);
    expect(a!.pass).toBe(true);
    expect(b!.detail).toMatch(/leads to <nav>, expected main/);
  });
  it("checks that a link leads to a named page", () => {
    const [a, b] = gradeSite(pages, [
      check({ id: "a", selector: "a[href='letter.html']", resolves: { page: "letter" }, pages: ["home"] }),
      check({ id: "b", selector: "a[href='letter.html']", resolves: { page: "home" }, pages: ["home"] }),
    ]);
    expect(a!.pass).toBe(true);
    expect(b!.detail).toMatch(/not to \/index.html/);
  });
});

describe("multi-page grading", () => {
  const home = new JSDOM(`<!doctype html><title>Home - Birds</title><body><h1>x</h1></body>`).window.document;
  const letter = new JSDOM(`<!doctype html><title>Home - Birds</title><body><h2>x</h2></body>`).window.document;
  const pages: GradedPage[] = [{ id: "home", path: "/index.html", doc: home }, { id: "letter", path: "/letter.html", doc: letter }];
  it("runs a check on every page and reports the page that fails", () => {
    const [r] = gradeSite(pages, [check({ selector: "body", outline: { start: 1 } })]);
    expect(r!.detail).toMatch(/on \/letter.html/);
  });
  it("pools elements across pages for site-wide uniqueness", () => {
    const [r] = gradeSite(pages, [check({ selector: "title", pooled: true, unique: "text", count: { min: 2 } })]);
    expect(r!.detail).toMatch(/appears more than once/);
  });
  it("limits a check to named pages", () => {
    const [r] = gradeSite(pages, [check({ selector: "h1", pages: ["home"] })]);
    expect(r!.pass).toBe(true);
  });
});

describe("text, rendering and the heading outline", () => {
  it("reads text without script, style, template or noscript contents", () => {
    const d = doc(`<p>Tide<script>var x = 1;</script><style>p{}</style><template>t</template><noscript>n</noscript> tables</p>`);
    expect(pass(d, { selector: "p", text: { matches: "^Tide tables$" } }).pass).toBe(true);
  });

  it("with rendered, skips hidden elements and hidden text", () => {
    const d = doc(`<p hidden>Members only</p><p>Archive<span style="display:none"> (members only)</span></p><p class="gone">members only</p>`, "<style>.gone { display: none }</style>");
    expect(pass(d, { selector: "p", text: { matches: "members only" } }).pass).toBe(true);
    const r = pass(d, { selector: "p", rendered: true, text: { matches: "members only" } });
    expect(r.pass).toBe(false);
    expect(pass(doc(`<p>Archive <span aria-hidden="true">(members only)</span></p>`), { selector: "p", rendered: true, text: { matches: "members only" } }).pass).toBe(true);
  });

  it("checks a heading's parent in the outline", () => {
    const d = doc(`<h1>Book</h1><h2>Lamp</h2><h3>Wick</h3><h2>Weather</h2><p hidden>Lamp Wick Weather Storm</p><h2>Watch</h2><h3>Storm</h3>`);
    const storm = { selector: "h3", text: { matches: "^Storm$" }, under: { matches: "^Weather$" } };
    expect(pass(d, storm).pass).toBe(false);
    expect(pass(d, { ...storm, every: true, text: undefined, selector: "h3:last-of-type" }).detail).toMatch(/sits under <h2> whose text|sits under <h2>, whose text/);
    expect(pass(d, { selector: "h3", text: { matches: "^Wick$" }, under: { matches: "^Lamp$" } }).pass).toBe(true);
    expect(pass(d, { selector: "h1", under: { matches: "." } }).detail).toMatch(/no heading of a higher rank/);
    expect(pass(doc("<p>x</p>"), { selector: "p", under: { matches: "." } }).detail).toMatch(/not a visible heading/);
  });
});

describe("axe checks", () => {
  const d = doc("<p>x</p>");
  it("fail when the host did not run the rules", () => {
    expect(pass(d, { axe: ["image-alt"] }).detail).toMatch(/did not run image-alt/);
  });
  it("pass with no findings and fail with one", () => {
    const c = check({ axe: ["image-alt", "link-name"] });
    expect(gradeDocument(d, [c], { axe: { "image-alt": [], "link-name": [] } })[0]!.pass).toBe(true);
    const r = gradeDocument(d, [c], { axe: { "image-alt": [{ rule: "image-alt", help: "Images must have alternative text", targets: ["img"] }], "link-name": [] } })[0]!;
    expect(r.detail).toMatch(/image-alt: Images must have alternative text \(img\)/);
  });
});

describe("problem files", () => {
  const base = {
    id: "p",
    statement: "s",
    starter: { html: "<p>a</p>" },
    solution: { html: "<h1>a</h1>" },
    grader: { type: "dom", checks: [{ id: "h", says: "h", selector: "h1" }] },
  };
  it("stays backward compatible with plain single-page problems", () => {
    expect(ProblemFile.safeParse(base).success).toBe(true);
  });
  it("accepts pages and stages, and refuses mixing single-page and pages", () => {
    const multi = {
      id: "p",
      statement: "s",
      pages: [{ id: "home", path: "/index.html", title: "Home", starter: { html: "" }, solution: { html: "" } }],
      grader: { type: "dom", stages: [{ id: "one", title: "One", says: "s", checks: [{ id: "h", says: "h", selector: "h1" }] }] },
    };
    expect(ProblemFile.safeParse(multi).success).toBe(true);
    expect(ProblemFile.safeParse({ ...multi, starter: { html: "" } }).success).toBe(false);
    expect(ProblemFile.safeParse({ ...base, grader: { ...base.grader, stages: multi.grader.stages } }).success).toBe(false);
  });
  it("builds fixtures from edits and reports edits that do not apply", () => {
    const p = ProblemFile.parse({ ...base, fixtures: { pass: [{ name: "x", edits: [{ find: "h1", replace: "h2" }] }], fail: [{ name: "y", edits: [{ find: "zz", replace: "" }], fails: ["h"] }] } });
    expect(fixtureCode(p, p.fixtures!.pass[0]!).index!.html).toBe("<h2>a</h1>");
    const q = ProblemFile.parse({ ...base, solution: { html: "<p>\n    a\n  b</p>" }, fixtures: { pass: [{ name: "x", edits: [{ find: "a b", replace: "c" }] }] } });
    expect(fixtureCode(q, q.fixtures!.pass[0]!).index!.html).toBe("<p>\n    c</p>");
    expect(validateProblem(p).join("\n")).toMatch(/edit target not found/);
  });
  it("reports duplicate check ids, bad patterns and unknown expected failures", () => {
    const p = ProblemFile.parse({
      ...base,
      grader: { type: "dom", checks: [{ id: "h", says: "h", selector: "h1", text: { matches: "(" } }, { id: "h", says: "h", selector: "p" }] },
      fixtures: { fail: [{ name: "w", html: "", fails: ["nope"] }] },
    });
    const m = validateProblem(p).join("\n");
    expect(m).toMatch(/check id h is used twice/);
    expect(m).toMatch(/invalid regular expression/);
    expect(m).toMatch(/unknown check nope/);
  });
});
