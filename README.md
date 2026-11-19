# Lunch Scorecard

A daily poll where coworkers rate the office lunch from 1 to 5 stars. It shows live results for the day and an all-time leaderboard of the best and worst lunches. Post the link in your Teams channel each day, or pin it as a channel tab.

It's a static site (GitHub Pages) with a free [Supabase](https://supabase.com) database for the votes. Nobody has to log in: people type their name once, and their browser remembers it.

## Setup (about 10 minutes)

### 1. Create the database

1. Sign up at [supabase.com](https://supabase.com) and create a new project. The free plan is enough.
2. In the project, open **SQL Editor → New query**, paste in the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
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
- **Leaderboard:** lunches with the same name are grouped together across days and ranked by average cookies. Lunches with 3 or more ratings get a "crowd favorite" tag at 4.5 and up, or "retire it" below 2.5.

## Good to know

- **Votes are tied to a browser, not a login.** Someone on two devices counts as two voters, and clearing site data starts them over as a new voter. That's fine for a lunch poll, but it isn't secure voting.
- **Fixing data:** open **Table Editor** in Supabase to edit or delete a lunch name or rating.
- **Free plan pausing:** Supabase pauses free projects after a week with no activity. Daily use keeps it awake. If it does pause, resume it from the Supabase dashboard.
