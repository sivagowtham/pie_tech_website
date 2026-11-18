# Putting the new PIE Tech website on the college hosting (DirectAdmin)

This is for the hosting account that runs pietech.edu.in. You do not need a terminal. Everything is done in
**DirectAdmin** (File Manager and Subdomain Management).

What runs where:

| Part | Where |
|---|---|
| Web pages, photos, clubs, news, gallery, research | the college hosting (this guide) |
| Content admin (`/admin/`) | the college hosting (one small PHP file, no database) |
| "Ask PIE Tech" chat assistant | stays on Cloudflare (it needs Cloudflare's AI); the pages call it automatically |

## 0. Do not replace the live site first
Test on a separate address first, so the current site keeps working. Use **`new.pietech.edu.in`**.

## 1. Create the test address
DirectAdmin → **Subdomain Management** → add the subdomain `new`. Note its folder, usually
`domains/pietech.edu.in/public_html/new` (DirectAdmin shows it).

## 2. Upload the site
1. DirectAdmin → **File Manager** → open the `new` folder from step 1.
2. **Upload** `pietech-site-directadmin.zip`, then select it and choose **Extract**.
3. Delete the zip. Make sure the file `.htaccess` is there (turn on "show hidden files" if you cannot see it).

## 3. Create the private settings (one time)
1. On your own computer, open `_setup/make-config.html` (from the extracted folder, or from the zip) in a browser and press **Generate**.
   Keep the **admin password** somewhere safe.
2. In File Manager, go to your **home folder** (the one that contains `domains`) and create a folder named **`pietech_private`**.
   It must be *outside* `domains`, so nobody can open it from the web.
3. Inside it create a file named **`config.php`** and paste the text from the page. Save.
4. In `_setup/` (inside the site folder) delete the files once you are done.

## 4. Check the folders can be written to
`media/` (inside the site folder) must be writable by the web server: right-click → **Permissions** → `755`.
If photo upload later says "The media folder is not writable", set it to `775`.

## 5. Try it
* Open `https://new.pietech.edu.in/` – the home page.
* Open `https://new.pietech.edu.in/admin/` – sign in as `admin` with the password from step 3, then open **Editors** and
  create a login for each CS faculty member who will update the site.
* Add a test news item and a test photo, press **Save**, and check the home page.

If `/admin/` shows "Admin is not configured yet", the `config.php` is in the wrong place (step 3) or the key is too short.
If saving shows an error about the API, the rewrite lines in `.htaccess` were not picked up: make sure `.htaccess` was extracted
into the same folder as `index.html` and that the host allows `.htaccess` (LiteSpeed and Apache both do).

## 6. Going live on pietech.edu.in (when you are happy)
1. In File Manager make a **backup**: copy the whole current `public_html` to a new folder `public_html_backup` (or use DirectAdmin
   **Backup and Restore**). Keep it.
2. The old site's PDFs live in `public_html/doc/`. **Do not delete the `doc` folder** – pages link to those files.
3. Copy everything from the `new` folder into `public_html` (replace files with the same name). Keep the old `.htaccess` lines that
   were already there (they may select the PHP version) and just **add** the lines from `htaccess-root.txt` below them.
4. Also copy the `media/.htaccess`, `server/` and `admin/` folders into `public_html`.
5. Open https://pietech.edu.in/ and https://pietech.edu.in/admin/ and test again.

Email (Roundcube/webmail, mailboxes) is not touched by any of this.

## Updating the website later
* **Content** (gallery, news, clubs, research): use `/admin/`. Nothing to upload.
* **Pages and design**: upload a new zip and extract it over the site (the content you entered in the admin is stored in
  `pietech_private`, so it is kept).

## Security notes
* Passwords are stored hashed; the admin password is only in `config.php` in the private folder.
* Logins are limited to 10 wrong tries per 15 minutes; sessions last 8 hours; changes by each person are listed under **Activity**.
* The `media/` folder is set so that nothing uploaded there can ever run as a program.
* Keep DirectAdmin and the hosting account password strong. DirectAdmin's own messages mention mailboxes that sent 1000 emails
  in a day – please check with your hosting provider that those mailboxes are not compromised.
