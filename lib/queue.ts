/**
 * A tiny serial queue: tasks run one at a time, in the order they were added.
 *
 * Used for two things in this project:
 *   1. Appending rows to Google Sheets, so two uploads at the same moment
 *      can't both read "the last row" and collide.
 *   2. Processing approvals, so two approvals can never grab the same
 *      calendar slot (double-booking guard).
 *
 * This only works because the app runs as ONE persistent Node process
 * (see README → Deployment). It is not a distributed lock.
 */
import { singleton } from "./singleton";

export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

export function createSerialQueue(): SerialQueue {
  // `tail` is the promise of the most recently queued task.
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    // Start `task` after the previous one settles — whether it succeeded or failed.
    const run = tail.then(task, task);
    // Keep the chain alive even if this task rejects; the caller still sees the error.
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Queue for every write that appends rows to the sheet. */
export const sheetAppendQueue = singleton("sheetAppendQueue", createSerialQueue);

/**
 * Queue for new applications: "is this a duplicate?" + "append the row" must
 * happen together, or two identical submissions could both pass the check.
 * (Separate from sheetAppendQueue — a task must never wait on its own queue.)
 */
export const intakeQueue = singleton("intakeQueue", createSerialQueue);

/** Queue for approvals → scheduling (one candidate at a time). */
export const approvalQueue = singleton("approvalQueue", createSerialQueue);
