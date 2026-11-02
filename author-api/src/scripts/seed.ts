
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

type BookData = {
  book_id: string;
  title: string;
  isbn?: string | null;
  genre?: string | null;
  publication_date?: string | null;
  status: string;
  mrp?: number | null;
  author_royalty_per_copy?: number | null;
  total_copies_sold?: number;
  total_royalty_earned?: number;
  royalty_paid?: number;
  royalty_pending?: number;
  last_royalty_payout_date?: string | null;
  print_partner?: string | null;
  available_on?: string[];
};

type AuthorData = {
  author_id: string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  joined_date?: string | null;
  books: BookData[];
};

type Dataset = {
  authors: AuthorData[];
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing from your .env file.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function toDate(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date in authors.json: ${value}`);
  }

  return date;
}

function toDecimal(value?: number | null): string | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return value.toFixed(2);
}

async function main() {
  const filePath = path.resolve(process.cwd(), "authors.json");
  const raw = await readFile(filePath, "utf8");
  const dataset = JSON.parse(raw) as Dataset;

  if (!Array.isArray(dataset.authors)) {
    throw new Error('authors.json must contain an "authors" array.');
  }

  const authorIds = new Set<string>();
  const emails = new Set<string>();
  const bookIds = new Set<string>();

  for (const author of dataset.authors) {
    if (!author.author_id || !author.name || !author.email) {
      throw new Error("An author is missing author_id, name, or email.");
    }

    if (authorIds.has(author.author_id)) {
      throw new Error(`Duplicate author_id: ${author.author_id}`);
    }
    authorIds.add(author.author_id);

    const emailKey = author.email.trim().toLowerCase();
    if (emails.has(emailKey)) {
      throw new Error(`Duplicate author email: ${author.email}`);
    }
    emails.add(emailKey);

    if (!Array.isArray(author.books)) {
      throw new Error(`Books must be an array for author ${author.author_id}`);
    }

    for (const book of author.books) {
      if (!book.book_id || !book.title || !book.status) {
        throw new Error(
          `A book for author ${author.author_id} is missing book_id, title, or status.`
        );
      }

      if (bookIds.has(book.book_id)) {
        throw new Error(`Duplicate book_id: ${book.book_id}`);
      }
      bookIds.add(book.book_id);
    }
  }

  let bookCount = 0;

  await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    for (const author of dataset.authors) {
      const savedAuthor = await tx.author.upsert({
        where: { authorId: author.author_id },
        update: {
          name: author.name,
          email: author.email.trim().toLowerCase(),
          phone: author.phone ?? null,
          city: author.city ?? null,
          joinedDate: toDate(author.joined_date),
        },
        create: {
          authorId: author.author_id,
          name: author.name,
          email: author.email.trim().toLowerCase(),
          phone: author.phone ?? null,
          city: author.city ?? null,
          joinedDate: toDate(author.joined_date),
        },
      });

      for (const book of author.books) {
        await tx.book.upsert({
          where: { bookId: book.book_id },
          update: {
            title: book.title,
            isbn: book.isbn ?? null,
            genre: book.genre ?? null,
            publicationDate: toDate(book.publication_date),
            status: book.status,
            mrp: toDecimal(book.mrp),
            authorRoyaltyPerCopy: toDecimal(book.author_royalty_per_copy),
            totalCopiesSold: book.total_copies_sold ?? 0,
            totalRoyaltyEarned: toDecimal(book.total_royalty_earned) ?? "0.00",
            royaltyPaid: toDecimal(book.royalty_paid) ?? "0.00",
            royaltyPending: toDecimal(book.royalty_pending) ?? "0.00",
            lastRoyaltyPayoutDate: toDate(book.last_royalty_payout_date),
            printPartner: book.print_partner ?? null,
            availableOn: book.available_on ?? [],
            authorId: savedAuthor.id,
          },
          create: {
            bookId: book.book_id,
            title: book.title,
            isbn: book.isbn ?? null,
            genre: book.genre ?? null,
            publicationDate: toDate(book.publication_date),
            status: book.status,
            mrp: toDecimal(book.mrp),
            authorRoyaltyPerCopy: toDecimal(book.author_royalty_per_copy),
            totalCopiesSold: book.total_copies_sold ?? 0,
            totalRoyaltyEarned: toDecimal(book.total_royalty_earned) ?? "0.00",
            royaltyPaid: toDecimal(book.royalty_paid) ?? "0.00",
            royaltyPending: toDecimal(book.royalty_pending) ?? "0.00",
            lastRoyaltyPayoutDate: toDate(book.last_royalty_payout_date),
            printPartner: book.print_partner ?? null,
            availableOn: book.available_on ?? [],
            authorId: savedAuthor.id,
          },
        });

        bookCount++;
      }
    }
  }, { timeout: 30000, maxWait: 10000 });

  console.log(`Import completed: ${dataset.authors.length} authors processed.`);
  console.log(`Books processed: ${bookCount}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
