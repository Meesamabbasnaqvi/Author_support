// Facts the draft prompt is allowed to use. Anything not listed here must not appear in the reply.
export interface DraftFact {
  label: string;
  value: string;
}

// Only the fields the draft needs. Never pass email, phone, or bank details here.
export interface DraftFactsSource {
  author: { name: string };
  book: { title: string; isbn: string | null } | null;
}

export function buildDraftFacts(ticket: DraftFactsSource): DraftFact[] {
  const facts: DraftFact[] = [{ label: "Author name", value: ticket.author.name }];
  if (ticket.book) {
    facts.push({ label: "Book title", value: ticket.book.title });
    facts.push({ label: "ISBN", value: ticket.book.isbn ?? "not on record" });
  }
  return facts;
}

export function formatFactsForPrompt(facts: DraftFact[]): string {
  return facts.map((f) => `- ${f.label}: ${f.value}`).join("\n");
}