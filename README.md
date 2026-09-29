# Outreach Tracker

Track prospects, outreach, follow-ups, replies, and status in your browser. Nothing is uploaded. The list is stored on this device only, and the app starts empty.

## How to open it

Keep `index.html`, `app.js`, `styles.css`, `xlsx.full.min.js`, and `favicon.svg` in the same folder.

- On your computer, open `index.html` in Chrome, Edge, or Firefox.
- The same folder can be hosted as a static site, including GitHub Pages.

A list saved by opening the file on disk is separate from a list saved on a hosted address. Export Excel from the browser that has the data, then import that file in the other one.

## What you can do

- See a quick home summary for prospects, reached out, not sent, in progress, positive, and negative.
- Open **Analytics** for those counts across all batches or one batch, plus prospects with a logged reply, response rate, and monthly outreach, follow-up, and response activity. Responded counts each prospect once when at least one reply is logged. The response rate is the share of reached-out prospects with a logged reply. Activity totals use saved log entries and dates; they do not infer historical activity from current status or outreach fields.
- Search by handle, name, angle, or email, and filter by niche, status, outreach, and batch.
- **Add prospect** opens the form. Handle, name, and niche are required. Niche suggestions are Wealth, Health, and Relationships, and you can type any niche.
- Paste a username or an Instagram profile URL. The app stores the handle and builds the profile link.
- Optional fields: email, specialty, followers, audience size, confidence, status, whether outreach was already sent, why they fit, offers or monetization, offer angle, and notes.
- Click a row to open the side panel. From there you can edit or delete the prospect, change status, and log outreach, follow-ups, replies, and notes.
- New prospects belong to a batch. The first person in an empty tracker starts **Batch 1**. After that, adding someone asks whether they join the latest batch or start the next one. Editing a prospect leaves their batch as it is.
- People already saved in this browser are **Batch 1**. Deleting prospects does not reuse a batch number. **Reset data** starts over at Batch 1.
- Saving an outreach message marks that prospect as sent. If they were Not contacted, the status moves to In progress.
- Each save and status change is timestamped in the activity log. You can delete a log entry.

Statuses are Not contacted, In progress, Positive, and Negative.

## Excel backup

**Export Excel** downloads one workbook:

- `Prospects` is the current list, including each person’s batch and the latest outreach, follow-up, and reply.
- `Activity` is the full log for each prospect.

**Import Excel** reads that workbook back in.

- An empty tracker imports the file immediately. A file with a Batch column keeps those batches. A file without one becomes **Batch 1**.
- If this browser already has prospects, choose **Replace list**, **Merge**, or **Cancel**. Merge adds people who are not already here and skips matching handles. Merge also asks whether those new people join the latest batch or start the next one. Replace keeps the batches in the file, or starts **Batch 1** when the file has none.
- **Reset data** clears this browser’s list after you confirm.

## Notes

- Data does not sync across browsers, devices, or between a local file and a hosted copy.
- Clearing site data for this address removes the list unless you exported first.
- The Excel library is included in the folder, so export and import work offline.
