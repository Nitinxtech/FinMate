import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { splitForHighlight } from "@/components/policy/highlight";
import { PolicyAsk } from "@/components/policy/policy-ask";
import { PolicyCompare } from "@/components/policy/policy-compare";
import { PolicyDocument } from "@/components/policy/policy-document";
import { PolicyOverview } from "@/components/policy/policy-overview";
import { comparePolicies } from "@/lib/policy/compare";
import type { PolicyAnswer } from "@/lib/policy/qa";
import { analyze } from "./helpers/policy";
import { healthPolicyA, healthPolicyB, healthPolicyConflicting } from "./fixtures/policies";

afterEach(cleanup);

describe("quote highlighting", () => {
  it("finds a quote across different whitespace and line breaks", () => {
    const parts = splitForHighlight("Claims for pre-existing\ndiseases   will be payable only after 36 months.", "pre-existing diseases will be payable");
    expect(parts.find((part) => part.highlight)?.text).toBe("pre-existing\ndiseases   will be payable");
  });

  it("returns the page unchanged when the quote is absent, too short, or full of regex characters", () => {
    expect(splitForHighlight("some text here", "not present at all")).toEqual([{ text: "some text here", highlight: false }]);
    expect(splitForHighlight("some text here", "abc")).toEqual([{ text: "some text here", highlight: false }]);
    expect(splitForHighlight("cost (approx.) [1+1]*", "(approx.) [1+1]*").find((part) => part.highlight)?.text).toBe("(approx.) [1+1]*");
    expect(() => splitForHighlight("x", "(((((((((((((((((((((")).not.toThrow();
  });
});

describe("key terms overview", () => {
  const conflicted = analyze(healthPolicyConflicting, "Conflicted", "doc-c");

  it("shows conflicts, terms with their exact words, and what could not be located", () => {
    render(<PolicyOverview extraction={conflicted.extraction} onJump={() => undefined} />);

    expect(screen.getAllByText("Conflicting provisions").length).toBe(2);
    expect(screen.getByText(/Different waiting periods are stated/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Waiting periods" })).toBeInTheDocument();
    expect(screen.getAllByText(/payable only after 36 months of continuous coverage/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stated in the policy").length).toBeGreaterThan(10);
  });

  it("lists absent categories as not located and does not invent them", () => {
    const silent = analyze(["SAMPLE SHIELD GENERAL INSURANCE COMPANY LIMITED\nSIMPLE HEALTH INSURANCE POLICY\nSum Insured: INR 2,00,000\nSECTION 1: BENEFITS\n1.1 We will pay hospitalisation expenses incurred in a network hospital."], "Silent", "doc-s");
    render(<PolicyOverview extraction={silent.extraction} onJump={() => undefined} />);

    expect(screen.getByText("Not located in this document")).toBeInTheDocument();
    expect(screen.getAllByText(/does not mean none applies/i).length).toBeGreaterThan(3);
    expect(screen.queryByRole("region", { name: "Waiting periods" })).not.toBeInTheDocument();
  });

  it("jumps to the page and clause when a reference is clicked", () => {
    const onJump = vi.fn();
    const a = analyze(healthPolicyA, "Care Plus", "doc-a");
    render(<PolicyOverview extraction={a.extraction} onJump={onJump} />);

    const region = screen.getByRole("region", { name: "Co-payments" });
    fireEvent.click(within(region).getByRole("button", { name: /p\.5/ }));

    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ page: 5, clauseRef: "5.1" }));
  });
});

describe("document viewer", () => {
  const a = analyze(healthPolicyA, "Care Plus", "doc-a");
  const render_ = (overrides: Partial<Parameters<typeof PolicyDocument>[0]> = {}) =>
    render(<PolicyDocument documentId="doc-a" documentTitle="Care Plus" pages={a.pages} clauses={a.clauses} extraction={a.extraction} focus={{ page: 4, clauseRef: "3.2", quote: "payable only after 36 months of continuous coverage" }} onFocus={() => undefined} {...overrides} />);

  it("highlights the cited words on the cited page", () => {
    const { container } = render_();
    const mark = container.querySelector("mark");

    expect(mark?.textContent).toMatch(/payable only after 36 months of continuous coverage/i);
    expect(screen.getByText(/page 4/i)).toBeInTheDocument();
  });

  it("offers clause navigation and a plain-language guide that is clearly separate from the policy", () => {
    render_();

    expect(screen.getByRole("button", { name: /3\.2/ })).toBeInTheDocument();
    expect(screen.getAllByText("General explanation, not a policy term").length).toBeGreaterThan(0);
    expect(screen.getByText("Waiting period", { selector: "p" })).toBeInTheDocument();
  });

  it("shows the policy's own definition next to the general one", () => {
    render_({ focus: { page: 2, clauseRef: null, quote: null } });
    expect(screen.getAllByText("Your policy defines it as:").length).toBeGreaterThan(0);
  });

  it("warns when a page was read by OCR", () => {
    render_({ pages: a.pages.map((page) => (page.page === 4 ? { ...page, source: "ocr" as const } : page)) });
    expect(screen.getByText(/Read by OCR, may contain errors/)).toBeInTheDocument();
  });

  it("renders hostile document text as inert text, never as markup", () => {
    const hostile = [{ page: 1, source: "text" as const, text: '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script> <a href="javascript:alert(1)">click</a>' }];
    const { container } = render_({ pages: hostile, clauses: [], extraction: null, focus: { page: 1, clauseRef: null, quote: null } });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="window.__pwned=1">');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("says so when a page has no readable text", () => {
    render_({ pages: [{ page: 1, source: "text", text: "" }], clauses: [], extraction: null, focus: { page: 1, clauseRef: null, quote: null } });
    expect(screen.getByText("No readable text was found on this page.")).toBeInTheDocument();
  });
});

describe("policy Q&A interface", () => {
  const answer: PolicyAnswer = {
    status: "partial",
    answer: "You must wait 36 months before pre-existing conditions are paid.",
    mode: "llm",
    claims: [
      { text: "Pre-existing diseases have a 36-month wait.", basis: "explicit", verified: true, sources: [{ documentId: "doc-a", documentTitle: "Care Plus", page: 4, clauseRef: "3.2", quote: "payable only after 36 months of continuous coverage" }] },
      { text: "A claim in year two would likely be declined.", basis: "interpretation", verified: false, sources: [] },
    ],
    notLocated: ["Nothing located about dental treatment."],
    ambiguities: ["Clause 8.1 gives a different period."],
    flags: [],
    relatedTerms: [{ term: "Waiting period", plain: "A time after the policy starts during which claims are not paid.", policyDefinition: null }],
    disclaimer: "This is an automated reading. Actual claim outcomes depend on the full policy, applicable law, and the insurer's own assessment.",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ answer }), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("separates stated terms from interpretation and shows sources, gaps, conflicts and the disclaimer", async () => {
    render(<PolicyAsk documentIds={["doc-a"]} onJump={() => undefined} />);
    fireEvent.change(screen.getByPlaceholderText(/Ask about this policy/), { target: { value: "How long is the waiting period?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Partly answered from the document")).toBeInTheDocument();
    expect(screen.getByText("Stated in the policy")).toBeInTheDocument();
    expect(screen.getByText("Interpretation")).toBeInTheDocument();
    expect(screen.getByText("no exact quote found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /p\.4/ })).toBeInTheDocument();
    expect(screen.getByText(/payable only after 36 months/)).toBeInTheDocument();
    expect(screen.getByText("Could not be located")).toBeInTheDocument();
    expect(screen.getByText("Ambiguity or conflict")).toBeInTheDocument();
    expect(screen.getByText(/insurer's own assessment/)).toBeInTheDocument();
    expect(screen.getByText("General explanation, not a policy term")).toBeInTheDocument();
  });

  it("sends the question with the chosen documents and no extra data", async () => {
    render(<PolicyAsk documentIds={["doc-a", "doc-b"]} />);
    fireEvent.change(screen.getByPlaceholderText(/Ask about this policy/), { target: { value: "What is excluded?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Partly answered from the document");

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/policies/ask");
    expect(JSON.parse(String(init.body))).toEqual({ question: "What is excluded?", documentIds: ["doc-a", "doc-b"] });
  });

  it("explains a failure without exposing internals", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Too many questions in a short time." }), { status: 429 })));
    render(<PolicyAsk documentIds={["doc-a"]} />);
    fireEvent.change(screen.getByPlaceholderText(/Ask about this policy/), { target: { value: "What is excluded?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many questions in a short time."));
  });

  it("rejects an empty or tiny question before calling the server", () => {
    render(<PolicyAsk documentIds={["doc-a"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/slightly longer question/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("comparison view", () => {
  const a = analyze(healthPolicyA, "Care Plus", "doc-a");
  const b = analyze(healthPolicyB, "Family Supreme", "doc-b");
  const comparison = comparePolicies([
    { id: "doc-a", title: "Care Plus", policyType: "health", insurer: a.extraction.insurer, extraction: a.extraction },
    { id: "doc-b", title: "Family Supreme", policyType: "health", insurer: b.extraction.insurer, extraction: b.extraction },
  ]);

  it("shows both documents, marks differences, and says when a term was not located", () => {
    render(<PolicyCompare comparison={comparison} />);

    expect(screen.getByRole("columnheader", { name: /Care Plus/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Family Supreme/ })).toBeInTheDocument();
    expect(screen.getAllByText("differs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not located in this document").length).toBeGreaterThan(0);
    expect(screen.getByText(/does not rank the policies or recommend one/)).toBeInTheDocument();
  });

  it("can hide the rows that match", () => {
    render(<PolicyCompare comparison={comparison} />);
    const before = screen.getAllByRole("row").length;
    fireEvent.click(screen.getByLabelText(/Show only terms that differ/));

    expect(screen.getAllByRole("row").length).toBeLessThan(before);
    // Every term still listed must be one that differs.
    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders.length).toBeGreaterThan(0);
    expect(rowHeaders.every((header) => within(header).queryByText("differs") !== null)).toBe(true);
  });
});
