import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Paperclip } from "lucide-react";
import { api } from "../../api/client";
import { ErrorBox, PageHeader } from "../../components/ui";

const schema = z.object({
  bookId: z.string().optional(),
  category: z.enum([
    "GENERAL_INQUIRY",
    "ROYALTY_PAYMENTS",
    "ISBN_METADATA",
    "PRINTING_QUALITY",
    "DISTRIBUTION_AVAILABILITY",
    "BOOK_STATUS_PRODUCTION",
  ]).default("GENERAL_INQUIRY"),
  subject: z
    .string()
    .trim()
    .min(5, "A few more words will help us find this quickly.")
    .max(120, "Keep the subject under 120 characters."),
  description: z
    .string()
    .trim()
    .min(20, "Tell us a little more, at least 20 characters.")
    .max(4000, "Keep the description under 4,000 characters."),
});
type FormValues = z.infer<typeof schema>;

// Shown only when the author's words match. Keeps the form uncluttered.
const answers = [
  {
    words: ["royalty", "payout", "paid", "payment", "pending", "money"],
    title: "When will my royalty be paid?",
    text: "Royalties are paid quarterly, within 45 days of the quarter ending. Your My books page shows the next payout date and the pending amount.",
    link: { to: "/books", label: "View my books" },
  },
  {
    words: ["isbn", "barcode"],
    title: "My ISBN looks wrong on a store",
    text: "Name the store and the book. ISBN problems are treated as high priority and go to our production team straight away.",
  },
  {
    words: ["missing", "unavailable", "listing", "store", "kobo", "amazon", "flipkart", "live"],
    title: "My book is missing or unavailable",
    text: "This is usually a stock sync issue. Name the store and the book, and we will ask the distribution team to re-sync it.",
  },
  {
    words: ["print", "copy", "copies", "blurry", "faded", "binding", "misprint", "quality"],
    title: "There is a problem with my printed copies",
    text: "Send photos of the defective copies in your reply. Once we verify the problem, we arrange a free reprint.",
  },
];

export default function NewTicketPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const books = useQuery({ queryKey: ["books"], queryFn: () => api.books() });

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { bookId: "", category: "GENERAL_INQUIRY", subject: "", description: "" },
  });

  const subject = watch("subject") ?? "";
  const description = watch("description") ?? "";

  const matches = useMemo(() => {
    const text = `${subject} ${description}`.toLowerCase();
    if (text.trim().length < 6) return [];
    return answers.filter((a) => a.words.some((w) => text.includes(w))).slice(0, 2);
  }, [subject, description]);

  const create = useMutation({
    mutationFn: (v: FormValues) => {
      const book = books.data?.find((b) => String(b.id) === v.bookId);
      return api.createTicket({
        subject: v.subject,
        description: v.description,
        category: v.category,
        bookTitle: book?.title,
        file,
      });
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      navigate(`/tickets/${t.id}`);
    },
  });

  return (
    <>
      <PageHeader
        title="Raise a query"
        lead="Tell us what is happening. Our team replies on this ticket, and you will see the reply here."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <form className="card space-y-6 p-6 sm:p-8" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
          {create.isError && <ErrorBox message="We could not send your query. Your text is still here, so you can try again." />}

          <div>
            <label htmlFor="bookId" className="mb-1.5 block text-sm font-medium">Which book is this about?</label>
            <select id="bookId" className="field" {...register("bookId")}>
              <option value="">General, account level</option>
              {books.data?.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="category" className="mb-1.5 block text-sm font-medium">What is this about?</label>
            <select id="category" className="field" {...register("category")}>
              <option value="GENERAL_INQUIRY">General inquiry</option>
              <option value="ROYALTY_PAYMENTS">Royalty payments</option>
              <option value="ISBN_METADATA">ISBN & metadata</option>
              <option value="PRINTING_QUALITY">Printing quality</option>
              <option value="DISTRIBUTION_AVAILABILITY">Distribution & availability</option>
              <option value="BOOK_STATUS_PRODUCTION">Book status & production</option>
            </select>
          </div>

          <div>
            <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">Subject</label>
            <input id="subject" className="field" aria-invalid={!!errors.subject} placeholder="For example, royalty for September is lower than expected" {...register("subject")} />
            {errors.subject && <p className="mt-1.5 text-xs text-critical">{errors.subject.message}</p>}
          </div>

          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium">Details</label>
            <textarea id="description" rows={7} className="field" aria-invalid={!!errors.description} placeholder="What happened, what you expected, and any numbers that help." {...register("description")} />
            {errors.description && <p className="mt-1.5 text-xs text-critical">{errors.description.message}</p>}
          </div>

          {matches.length > 0 && (
            <div className="rounded-lg border border-accent/20 bg-accent-soft p-4" aria-live="polite">
              <p className="text-sm font-semibold text-accent">This might already answer your question</p>
              <ul className="mt-3 space-y-3">
                {matches.map((m) => (
                  <li key={m.title}>
                    <p className="text-sm font-medium">{m.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{m.text}</p>
                    {m.link && (
                      <Link to={m.link.to} className="mt-1 inline-block text-sm font-medium text-accent hover:underline">
                        {m.link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Still want to send your query? Keep going below.</p>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium">Attachment <span className="font-normal text-muted">(optional)</span></p>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3 text-sm hover:bg-canvas">
              <Paperclip className="h-4 w-4 text-muted" aria-hidden />
              <span className="flex-1 truncate text-muted">{file ? file.name : "Add a photo, screenshot or PDF (max 5MB)"}</span>
              <span className="font-medium text-accent">{file ? "Change" : "Choose file"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  setFileError(null);
                  const chosen = e.target.files?.[0];
                  if (!chosen) return;
                  if (chosen.size > 5 * 1024 * 1024) {
                    setFileError("Files must be 5MB or less.");
                    return;
                  }
                  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
                  if (!allowed.includes(chosen.type)) {
                    setFileError("Only images (JPG, PNG, WebP) and PDF documents are allowed.");
                    return;
                  }
                  setFile(chosen);
                }}
              />
            </label>
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="mt-1.5 text-xs text-muted hover:text-critical"
              >
                Remove attachment
              </button>
            )}
            {fileError && <p className="mt-1.5 text-xs text-critical">{fileError}</p>}
            {!file && !fileError && (
              <p className="mt-1.5 text-xs text-subtle">Supports JPG, PNG, WebP, and PDF up to 5MB.</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
            <Link to="/tickets" className="btn-ghost">Cancel</Link>
            <button type="submit" className="btn-primary" disabled={isSubmitting || create.isPending}>
              {create.isPending ? "Sending…" : "Send query"}
            </button>
          </div>
        </form>

        <aside className="space-y-4 text-sm text-muted lg:pt-2">
          <p className="font-medium text-ink">What happens next</p>
          <ol className="space-y-3">
            <li>Your query is saved straight away and sent to the support team.</li>
            <li>A member of the team reads it and replies on this ticket.</li>
            <li>You will see the reply here, and the ticket status will update as work moves on.</li>
          </ol>
        </aside>
      </div>
    </>
  );
}
