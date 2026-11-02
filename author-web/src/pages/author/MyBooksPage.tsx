import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { ErrorBox, LoadingRows, PageHeader } from "../../components/ui";
import { dateShort, money } from "../../lib/labels";

export default function MyBooksPage() {
  const summary = useQuery({ queryKey: ["author-summary"], queryFn: () => api.authorSummary() });
  const books = useQuery({ queryKey: ["books"], queryFn: () => api.books() });
  const minimum = summary.data?.minimumPayout ?? 1000;

  return (
    <>
      <PageHeader
        title="My books"
        lead="Figures come from BookLeaf's records. Royalties are paid quarterly, and any amount under the minimum rolls over."
      />

      {books.isLoading && <LoadingRows rows={4} />}
      {books.isError && <ErrorBox message="We could not load your books. Try again in a moment." />}

      {books.data && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-5 py-3 font-medium">Book</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">MRP</th>
                <th className="px-4 py-3 text-right font-medium">Copies sold</th>
                <th className="px-4 py-3 text-right font-medium">Earned</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-5 py-3 text-right font-medium">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {books.data.map((b) => {
                const belowMin = b.royaltyPending > 0 && b.royaltyPending < minimum;
                return (
                  <tr key={b.id} className="align-top hover:bg-canvas/60">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{b.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{b.genre} · ISBN {b.isbn}</p>
                    </td>
                    <td className="px-4 py-4 text-ink">
                      {b.publicationDate ? dateShort(b.publicationDate) : <span className="text-muted">Not yet</span>}
                    </td>
                    <td className="px-4 py-4">
                      <p>{b.status}</p>
                      {b.productionStage && <p className="mt-0.5 text-xs text-muted">Waiting on {b.productionStage.toLowerCase()}</p>}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">{money(b.mrp)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{b.copiesSold.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{money(b.royaltyEarned)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{money(b.royaltyPaid)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      <p className="font-semibold">{money(b.royaltyPending)}</p>
                      {belowMin && <p className="mt-0.5 text-xs text-muted">Below minimum, rolls over</p>}
                      {b.royaltyPending === 0 && b.copiesSold === 0 && <p className="mt-0.5 text-xs text-muted">No sales yet</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
