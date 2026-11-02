
// import type { AuthorSummary, Book, InternalNote, Me, TicketDetail, TicketMessage } from "./types";

// export const authorUser: Me = { id: 1, name: "Asha Menon", email: "asha.menon@example.com", role: "AUTHOR", authorId: 1 };
// export const adminUser: Me = { id: 100, name: "Rohan Sharma", email: "rohan.sharma@bookleaf.example", role: "ADMIN" };

// export const books: Book[] = [
//   {
//     id: 1,
//     title: "The Quiet Monsoon",
//     isbn: "978-93-5432-101-2",
//     genre: "Literary fiction",
//     publicationDate: "2026-03-14",
//     status: "Live",
//     copiesSold: 1284,
//     mrp: 399,
//     royaltyEarned: 38210,
//     royaltyPaid: 35000,
//     royaltyPending: 3210,
//     platforms: ["Amazon", "Flipkart", "Kobo"],
//   },
//   {
//     id: 2,
//     title: "Lanterns on Dhanmondi Road",
//     isbn: "978-93-5432-118-0",
//     genre: "Memoir",
//     publicationDate: null,
//     status: "In production",
//     productionStage: "Cover approval",
//     copiesSold: 0,
//     mrp: 349,
//     royaltyEarned: 0,
//     royaltyPaid: 0,
//     royaltyPending: 0,
//     platforms: [],
//   },
//   {
//     id: 3,
//     title: "Salt and Sugarcane",
//     isbn: "978-93-5432-094-7",
//     genre: "Non-fiction",
//     publicationDate: "2025-11-02",
//     status: "Live",
//     copiesSold: 212,
//     mrp: 275,
//     royaltyEarned: 30.5,
//     royaltyPaid: 0,
//     royaltyPending: 30.5,
//     platforms: ["Amazon"],
//   },
//   {
//     id: 4,
//     title: "A Map Without Roads",
//     isbn: "978-93-5432-107-4",
//     genre: "Travel",
//     publicationDate: "2026-07-19",
//     status: "Live",
//     copiesSold: 40,
//     mrp: 199,
//     royaltyEarned: 310,
//     royaltyPaid: 0,
//     royaltyPending: 310,
//     platforms: ["Flipkart"],
//   },
// ];

// export const authorSummary: AuthorSummary = {
//   id: 1,
//   name: "Asha Menon",
//   email: "asha.menon@example.com",
//   royaltyPendingTotal: books.reduce((sum, b) => sum + b.royaltyPending, 0), // 3550.5
//   nextPayoutDeadline: "2026-11-14",
//   minimumPayout: 1000,
//   bankDetailsStatus: "Verified",
// };

// const asha = { name: "Asha Menon", email: "asha.menon@example.com", bankDetailsStatus: "Verified" };
// const meera = { name: "Meera Iyer", email: "meera.iyer@example.com", bankDetailsStatus: "Missing" };
// const rohanS = { name: "Rohan Shah", email: "rohan.shah@example.com", bankDetailsStatus: "Verified" };

// const msg = (id: number, isAdmin: boolean, senderName: string, body: string, createdAt: string): TicketMessage => ({
//   id,
//   isAdmin,
//   senderName,
//   body,
//   createdAt,
// });

// let tickets: TicketDetail[] = [
//   {
//     id: 1042,
//     subject: "Royalty for the last quarter has not arrived",
//     description: "My statement shows ₹3,210 pending for The Quiet Monsoon, but the payout date has passed. Can you check?",
//     status: "IN_PROGRESS",
//     category: "ROYALTY_PAYMENTS",
//     priority: "HIGH",
//     bookTitle: "The Quiet Monsoon",
//     authorName: asha.name,
//     author: asha,
//     updatedAt: "2026-10-28T09:10:00Z",
//     createdAt: "2026-10-26T06:40:00Z",
//     hasNewReply: true,
//     aiState: "CLASSIFIED",
//     categorySource: "AI",
//     prioritySource: "AI",
//     assignedAdminName: adminUser.name,
//     overdue: false,
//     aiSuggestedCategory: "ROYALTY_PAYMENTS",
//     aiSuggestedPriority: "HIGH",
//     messages: [
//       msg(1, false, asha.name, "My statement shows ₹3,210 pending for The Quiet Monsoon, but the payout date has passed. Can you check?", "2026-10-26T06:40:00Z"),
//       msg(2, true, "BookLeaf Support", "Hi Asha, thanks for flagging this. Your pending royalty of ₹3,210 is above the ₹1,000 minimum, so it is eligible for the next payout on 14 Nov 2026. We are confirming your bank details with our finance team and will update you by 30 Oct.", "2026-10-28T09:10:00Z"),
//     ],
//   },
//   {
//     id: 1040,
//     subject: "ISBN on the Flipkart listing is wrong",
//     description: "The Flipkart page for Salt and Sugarcane shows a different ISBN from the one on my copies.",
//     status: "OPEN",
//     category: "ISBN_METADATA",
//     priority: "CRITICAL",
//     bookTitle: "Salt and Sugarcane",
//     authorName: asha.name,
//     author: asha,
//     updatedAt: "2026-10-27T11:02:00Z",
//     createdAt: "2026-10-27T11:02:00Z",
//     hasNewReply: false,
//     aiState: "CLASSIFIED",
//     categorySource: "AI",
//     prioritySource: "AI",
//     overdue: false,
//     aiSuggestedCategory: "ISBN_METADATA",
//     aiSuggestedPriority: "CRITICAL",
//     messages: [
//       msg(3, false, asha.name, "The Flipkart page for Salt and Sugarcane shows a different ISBN from the one on my copies.", "2026-10-27T11:02:00Z"),
//     ],
//   },
//   {
//     id: 1031,
//     subject: "Cover proof looks faded",
//     description: "The cover proof for Lanterns on Dhanmondi Road looks washed out compared with the file I sent.",
//     status: "IN_PROGRESS",
//     category: "PRINTING_QUALITY",
//     priority: "MEDIUM",
//     bookTitle: "Lanterns on Dhanmondi Road",
//     authorName: asha.name,
//     author: asha,
//     updatedAt: "2026-10-22T08:30:00Z",
//     createdAt: "2026-10-21T13:15:00Z",
//     hasNewReply: false,
//     aiState: "CLASSIFIED",
//     categorySource: "AI",
//     prioritySource: "ADMIN",
//     overdue: true,
//     aiSuggestedCategory: "PRINTING_QUALITY",
//     aiSuggestedPriority: "HIGH",
//     messages: [
//       msg(4, false, asha.name, "The cover proof for Lanterns on Dhanmondi Road looks washed out compared with the file I sent.", "2026-10-21T13:15:00Z"),
//       msg(5, true, "BookLeaf Support", "Thanks for the comparison, Asha. Could you send two photos of the proof under daylight? That lets the print team check the colour profile.", "2026-10-22T08:30:00Z"),
//     ],
//   },
//   {
//     id: 1012,
//     subject: "Can I update my author bio?",
//     description: "I would like to change the bio on my author page. Is that possible?",
//     status: "RESOLVED",
//     category: "GENERAL_INQUIRY",
//     priority: "LOW",
//     authorName: asha.name,
//     author: asha,
//     updatedAt: "2026-10-15T10:00:00Z",
//     createdAt: "2026-10-14T09:00:00Z",
//     hasNewReply: false,
//     aiState: "UNAVAILABLE",
//     categorySource: "DEFAULT",
//     prioritySource: "DEFAULT",
//     overdue: false,
//     messages: [
//       msg(6, false, asha.name, "I would like to change the bio on my author page. Is that possible?", "2026-10-14T09:00:00Z"),
//       msg(7, true, "BookLeaf Support", "Yes, you can send the new bio by replying here. It usually reflects on the store within 3 to 5 business days.", "2026-10-15T10:00:00Z"),
//     ],
//   },
//   // Other authors, so the queue looks like a real queue.
//   {
//     id: 1044,
//     subject: "Book missing from the Kobo store",
//     description: "Monsoon Notes is showing as unavailable on Kobo since this morning.",
//     status: "OPEN",
//     category: "DISTRIBUTION_AVAILABILITY",
//     priority: "CRITICAL",
//     bookTitle: "Monsoon Notes",
//     authorName: rohanS.name,
//     author: rohanS,
//     updatedAt: "2026-10-28T07:00:00Z",
//     createdAt: "2026-10-27T07:00:00Z",
//     hasNewReply: false,
//     aiState: "CLASSIFIED",
//     categorySource: "AI",
//     prioritySource: "AI",
//     overdue: true,
//     aiSuggestedCategory: "DISTRIBUTION_AVAILABILITY",
//     aiSuggestedPriority: "CRITICAL",
//     messages: [msg(8, false, rohanS.name, "Monsoon Notes is showing as unavailable on Kobo since this morning.", "2026-10-28T07:00:00Z")],
//   },
//   {
//     id: 1039,
//     subject: "Reprint timeline for the hardcover",
//     description: "Can you confirm when the hardcover reprint will ship?",
//     status: "IN_PROGRESS",
//     category: "PRINTING_QUALITY",
//     priority: "MEDIUM",
//     bookTitle: "Ink and Ash",
//     authorName: meera.name,
//     author: meera,
//     updatedAt: "2026-10-27T15:20:00Z",
//     createdAt: "2026-10-26T10:00:00Z",
//     hasNewReply: false,
//     aiState: "PENDING",
//     categorySource: "DEFAULT",
//     prioritySource: "DEFAULT",
//     assignedAdminName: adminUser.name,
//     overdue: false,
//     messages: [msg(9, false, meera.name, "Can you confirm when the hardcover reprint will ship?", "2026-10-26T10:00:00Z")],
//   },
//   {
//     id: 1036,
//     subject: "Royalty statement shows fewer copies",
//     description: "My statement says 180 copies for September but the platform dashboard shows 210.",
//     status: "OPEN",
//     category: "ROYALTY_PAYMENTS",
//     priority: "HIGH",
//     bookTitle: "Tea Stall Stories",
//     authorName: "Kabir Desai",
//     author: { name: "Kabir Desai", email: "kabir.desai@example.com", bankDetailsStatus: "Verified" },
//     updatedAt: "2026-10-26T12:45:00Z",
//     createdAt: "2026-10-26T12:45:00Z",
//     hasNewReply: false,
//     aiState: "CLASSIFIED",
//     categorySource: "AI",
//     prioritySource: "AI",
//     overdue: false,
//     aiSuggestedCategory: "ROYALTY_PAYMENTS",
//     aiSuggestedPriority: "HIGH",
//     messages: [msg(10, false, "Kabir Desai", "My statement says 180 copies for September but the platform dashboard shows 210.", "2026-10-26T12:45:00Z")],
//   },
//   {
//     id: 1033,
//     subject: "Please update the description on Amazon",
//     description: "I updated the blurb in my manuscript notes. Can you push it to Amazon?",
//     status: "RESOLVED",
//     category: "GENERAL_INQUIRY",
//     priority: "LOW",
//     bookTitle: "Night Ferry",
//     authorName: "Nisha Rao",
//     author: { name: "Nisha Rao", email: "nisha.rao@example.com", bankDetailsStatus: "Verified" },
//     updatedAt: "2026-10-20T10:30:00Z",
//     createdAt: "2026-10-19T08:00:00Z",
//     hasNewReply: false,
//     aiState: "CLASSIFIED",
//     categorySource: "AI",
//     prioritySource: "AI",
//     overdue: false,
//     aiSuggestedCategory: "GENERAL_INQUIRY",
//     aiSuggestedPriority: "LOW",
//     messages: [
//       msg(11, false, "Nisha Rao", "I updated the blurb in my manuscript notes. Can you push it to Amazon?", "2026-10-19T08:00:00Z"),
//       msg(12, true, "BookLeaf Support", "Done. The new description is live on Amazon India and should show within 3 to 5 business days.", "2026-10-20T10:30:00Z"),
//     ],
//   },
// ];

// const notes: Record<number, InternalNote[]> = {
//   1042: [
//     {
//       id: 1,
//       adminName: adminUser.name,
//       body: "Bank details look stale. Checking with finance before we confirm the payout date.",
//       createdAt: "2026-10-28T08:50:00Z",
//     },
//   ],
// };

// export const listTickets = () => tickets;
// export const getTicket = (id: number) => tickets.find((t) => t.id === id);
// export const ticketsFor = (authorName: string) => tickets.filter((t) => t.authorName === authorName);
// export const notesFor = (id: number) => notes[id] ?? [];

// export function appendMessage(id: number, body: string, isAdmin: boolean, senderName: string) {
//   const t = getTicket(id);
//   if (!t) return;
//   const now = new Date().toISOString();
//   t.messages.push(msg(Date.now(), isAdmin, senderName, body, now));
//   t.updatedAt = now;
//   if (isAdmin) t.hasNewReply = true;
// }

// export function markRead(id: number) {
//   const t = getTicket(id);
//   if (t) t.hasNewReply = false;
// }

// export function addNote(id: number, body: string) {
//   notes[id] = [...notesFor(id), { id: Date.now(), adminName: adminUser.name, body, createdAt: new Date().toISOString() }];
// }

// export function createTicket(input: { subject: string; description: string; bookTitle?: string }): TicketDetail {
//   const now = new Date().toISOString();
//   const t: TicketDetail = {
//     id: 1100 + tickets.length,
//     subject: input.subject,
//     description: input.description,
//     status: "OPEN",
//     category: "GENERAL_INQUIRY",
//     priority: "MEDIUM",
//     bookTitle: input.bookTitle,
//     authorName: asha.name,
//     author: asha,
//     updatedAt: now,
//     createdAt: now,
//     hasNewReply: false,
//     aiState: "PENDING",
//     categorySource: "DEFAULT",
//     prioritySource: "DEFAULT",
//     overdue: false,
//     messages: [msg(Date.now(), false, asha.name, input.description, now)],
//   };
//   tickets = [t, ...tickets];
//   return t;
// }
