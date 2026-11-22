# Sing Along Stage

A bilingual worship lyrics presenter.

- English songs show each line with its Arabic translation.
- Arabic songs show the Arabic line, an easy pronunciation in English letters, and a smaller English translation.
- Each verse or chorus stays on one screen, and the text shrinks to fit.
- The background moves and changes colour to match the mood of each part.

**Viewers** can open the library and present songs without logging in. **Editors** log in to add, edit and delete songs. These rules are enforced by the database, so nobody else can change songs even if they read the code.

There is no AI. You type or paste translations yourself.

## Files

| File | What it is |
|---|---|
| `index.html` | The page and its styles |
| `app.js` | The app |
| `config.js` | Your Supabase URL and public key |
| `supabase/schema.sql` | Database tables and permission rules |

## Try it first (demo mode)

Open `index.html` in a browser with `config.js` left empty. Everything works, but songs are saved in that browser only and there are no logins.

## Setup

### 1. Create the database (Supabase, free)

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and press **Run**.
3. Open **Authentication** settings and turn off **Allow new users to sign up**, so only people you add can log in.

### 2. Add your editors

1. Go to **Authentication > Users > Add user**. Enter the person's email and a password, and tick **Auto Confirm User**.
2. In **SQL Editor**, run this with their email:

```sql
insert into public.editors (user_id)
select id from auth.users where email = 'editor@example.com';
```

To remove an editor:

```sql
delete from public.editors
where user_id = (select id from auth.users where email = 'editor@example.com');
```

### 3. Connect the app

In Supabase, go to **Project Settings > API** and copy the **Project URL** and the **anon public** key into `config.js`:

```js
window.SING_CONFIG = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'eyJ...'
};
```

The anon key is safe to make public. Never put the **service_role** key in this project.

### 4. Put it on GitHub Pages

```bash
git init
git add .
git commit -m "Sing Along Stage"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sing-along-stage.git
git push -u origin main
```

Then in the repo go to **Settings > Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. After a minute your site is live at `https://YOUR-USERNAME.github.io/sing-along-stage/`.

Every time you push, the site updates.

## Using it

**Adding a song (editors)**

1. Log in, then press **Add song**.
2. Paste the lyrics as you found them. Keep the empty lines between groups.
3. Paste the translation in the next box, one line for each lyric line. For Arabic songs, paste the pronunciation and the English translation in their own boxes.
4. Press **Find parts and match lines**. Repeated groups become the Chorus, others become Verses, and a different part after the second chorus becomes the Bridge. Extra web text like "Lyrics", "Embed", credits and chord letters is removed, and "(x2)" lines are written out twice.
5. Fix things in the part list. The live preview on the right shows exactly how the selected part will look.
   - **Up / Down** reorders parts
   - **Duplicate** copies a part (for example, to repeat a chorus)
   - **Join with part above** merges two parts into one screen
   - **Split** starts a new part from that line
   - The mood menu changes the background for that part
6. Press **Save to library**.

**Presenting**

Press play on a song. Use the arrow keys, the space bar, swipe, or the part buttons at the bottom. Press **Full screen** or the `F` key. Esc closes it.

**Backup**

**Export** downloads the whole library as a JSON file. Editors can **Import** it again, and songs with the same title are skipped.
