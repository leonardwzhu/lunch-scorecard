// Paste your Supabase project's URL and anon (public) key here.
// Find both in Supabase: Project Settings → API.
// The anon key is meant to be public; the access rules in supabase/schema.sql control what it can do.
window.LUNCH_CONFIG = {
  supabaseUrl: "https://wwceeniyqlgzswsyjqzk.supabase.co",
  supabaseAnonKey: "sb_publishable_g31h0mZLxL3KKgZuYPnDTQ_8QE_9n4d",
  teamName: "",                // optional, shown in the Teams message, e.g. "the design team"
  lunchWeekdays: [1, 2, 3, 4], // days with an office lunch: 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday
  // Joke tip jar with real Venmo buttons. It only shows once venmoUser is set (your Venmo username, without the @).
  rentFund: { name: "Leonard", venmoUser: "leonardzhu" },
};
