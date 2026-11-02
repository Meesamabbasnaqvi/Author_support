import test from "node:test";
import assert from "node:assert/strict";
import { suggestPriority } from "./triage.js";

test("Triage Rules Suite", async (t) => {
    // Test 1: Category base priority
    await t.test("Rule 0: starts from the category usual base priority", () => {
        const res = suggestPriority({ category: "GENERAL_INQUIRY" });
        assert.equal(res.priority, "MEDIUM");
        assert.match(res.reason, /standard priority/i);
    });

    // Test 2: Wrong ISBN is at least High
    await t.test("Rule 1: wrong ISBN raises priority to at least High", () => {
        const res = suggestPriority({
            category: "ISBN_METADATA",
            isWrongIsbn: true,
        });
        assert.equal(res.priority, "HIGH");
        assert.match(res.reason, /ISBN errors block/i);
    });

    // Test 3: Unavailable book is High
    await t.test("Rule 2: an unavailable book raises priority to High", () => {
        const res = suggestPriority({
            category: "DISTRIBUTION_AVAILABILITY",
            isBookUnavailable: true,
            bookStatus: "Live",
        });
        assert.equal(res.priority, "HIGH");
        assert.match(res.reason, /unavailable live book/i);
    });

    // Test 4: Overdue payout is Critical
    await t.test("Rule 3: an overdue payout raises priority to Critical", () => {
        const res = suggestPriority({
            category: "ROYALTY_PAYMENTS",
            isOverduePayout: true,
        });
        assert.equal(res.priority, "CRITICAL");
        assert.match(res.reason, /overdue royalty payouts/i);
    });

    // Test 5: In production delays never go above Medium
    await t.test("Rule 4: a book in production never goes above Medium for delays", () => {
        const res = suggestPriority({
            category: "BOOK_STATUS_PRODUCTION",
            bookStatus: "In production",
            isProductionDelay: true,
        });
        assert.equal(res.priority, "MEDIUM");
        assert.match(res.reason, /capped at medium/i);
    });

});