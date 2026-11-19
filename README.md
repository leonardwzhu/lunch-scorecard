# Lunch Scorecard

A daily poll where coworkers rate the office lunch from 1 to 5 stars. It shows live results for the day and an all-time leaderboard of the best and worst lunches. Post the link in your Teams channel each day, or pin it as a channel tab.

It's a static site (GitHub Pages) with a free [Supabase](https://supabase.com) database for the votes. Nobody has to log in: people type their name once, and their browser remembers it.

## Setup (about 10 minutes)

### 1. Create the database

1. Sign up at [supabase.com](https://supabase.com) and create a new project. The free plan is enough.
2. In the project, open **SQL Editor → New query**, paste in the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. Then do the same with [`supabase/002_out_of_office_and_rating_votes.sql`](supabase/002_out_of_office_and_rating_votes.sql).
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Connect the page

Edit [`config.js`](config.js) and paste in the two values:

```js
window.LUNCH_CONFIG = {
  supabaseUrl: "https://abcdefghijkl.supabase.co",
  supabaseAnonKey: "eyJ...",
  teamName: "",
};
```

The anon key is meant to be public. It can only do what the rules in `schema.sql` allow: read results, name a lunch, and add or change a rating.

### 3. Turn on GitHub Pages

In the repo, go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. After a minute the poll is live at `https://<your-username>.github.io/lunch-scorecard/`.

### 4. Share it in Teams

Open the page and use **Copy message** at the bottom to get a ready-to-post message with today's date and the link. To keep it handy, add it to your channel as a tab: **+ → Website**, then paste the link.

## How it works

- **Name the lunch:** whoever gets there first types in what was served. Anyone can fix a typo.
- **Rate it:** 1–5 cookies plus an optional comment. Results for a lunch stay hidden until you rate it (once its week-long voting window closes, anyone can see them). People can change their rating, and can rate lunches from up to a week back.
- **Out of office:** if you missed lunch, tap **I wasn't in the office for this lunch**. You can then see the results but can't rate that lunch, and this can't be undone.
- **Agree or disagree:** anyone who can see a day's results can up- or down-vote other people's ratings (not their own). Tap the same arrow again to take your vote back. The most agreed-with ratings show first.
- **Leaderboard:** lunches with the same name are grouped together across days and ranked by average cookies. Lunches with 3 or more ratings get a "crowd favorite" tag at 4.5 and up, or "retire it" below 2.5.

- **Streaks:** 🔥 shows how many lunches in a row someone has rated or marked themselves out of office. Missing a lunch resets it; days without an office lunch never count.
- **Friday recap:** lunch of the week, biggest letdown, comment of the week (most up votes), and awards for hottest streak, most agreed-with, harshest critic, easiest to please and contrarian. **Copy recap for Teams** gives a ready-to-post summary. Early in the week it shows last week's recap.
- **Taste twins:** once you've rated a couple of lunches, see whose ratings are closest to yours, and the most alike pair in the office.
- **Lunch days only:** lunch is Monday to Thursday (change `lunchWeekdays` in `config.js` if that changes). The date arrows skip other days, and on Friday or the weekend the page opens on Thursday's lunch.

## Good to know

- **Votes are tied to a browser, not a login.** Someone on two devices counts as two voters, and clearing site data starts them over as a new voter. That's fine for a lunch poll, but it isn't secure voting.
- **Fixing data:** open **Table Editor** in Supabase to edit or delete a lunch name or rating.
- **Free plan pausing:** Supabase pauses free projects after a week with no activity. Daily use keeps it awake. If it does pause, resume it from the Supabase dashboard.
