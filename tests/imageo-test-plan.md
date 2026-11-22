# Imageo release and showcase tests

This plan covers SharePoint package `1.4.1.5` and Imageo Function `0.5.2`. Follow a news banner from its first prompt to a library edit. Then try the same controls with a picture already in the library.

## Recording plan for the README and blog

Start with a club newsletter that needs a banner. Follow the same boat from **Create** to **Gallery** so readers can see where generating ends and editing begins. Use the picture with two red markers to show what happens inside and outside a selection.

| Scene | What the author does | What the viewer should see |
|---|---|---|
| 1. Find a picture in the library | Open Imageo from a site's front page. Search the gallery, filter PNG or JPEG, sort by date or creator, or browse a library. Select the green sail and choose **Refine**. | The launcher opens the gallery. A picture becomes available to edit when the author selects it. |
| 2. Make a banner for the newsletter | In **Create**, show the optional page sections and style note. Pick a wide banner from the three sizes, switch on **Transparent background**, then generate the orange boat. Show **Retry** and use quick **Refine** to turn the sail green. | The saved original is 2048 × 1152. Show its transparent background against colour. Retry starts another picture. Refine starts with the existing picture. Compare the actual backgrounds of the orange and green results. |
| 3. Change one colour | Open the saved green boat. Show the colour picker and eyedropper, then mark the sail. Touch up its edge with **Add brush** or **Erase brush**. Show brush size, the numbered instruction, **Send**, **Compare with original** and **Save as copy**. | The author chooses the new colour and the area to change in two separate steps. Show the dark purple result beside the green original. |
| 4. Ask Luna for the words | Type “Make the sail easier to see from a distance. Keep the ropes as they are.” Choose **Suggest an instruction**. Show the real reply and the editable text box. Show where the author can choose to include a page summary. | The suggestion appears while the picture stays the same. Show which button asks Luna for text and which button sends the final edit to MAI. Pair a changed picture with the instruction that actually produced it. |
| 5. Take one thing out | Open the picture with two red markers. Choose **Remove object** and click the left marker. Show the stripes, the pink guide sent to MAI and the returned water. Compare and undo. | The left marker disappears. The right marker stays in place. Check the saved copy against the original before making a pixel-level claim. |
| 6. Keep the subject and change what is around it | Start with a saved picture. Mark the subject to keep. Show a transparent cutout, a solid background and **Replace scene**. Crop or resize a copy and save it. | Put the cutout on two colours. Show the saved dimensions. Name the edits performed by the browser. For a new scene, show the actual instruction and its matching MAI result. |

**Where to put the footage.** Give each task its own GIF for the README and its own player in the blog. The six scenes above share a story. Split them into gallery, page prompt, generation, Retry, quick Refine, marking a selection, recolour, Luna wording, object removal, transparent background, solid background, scene replacement, crop and resize. Show a static gallery, generation settings, quick Refine and editor, plus the four-panel removal comparison. Keep the architecture walkthrough separate.

**Before calling the recordings finished.** Capture the current release with neutral pictures and names. Mark footage that replays a saved model response. Check real PNGs for dimensions, transparency and protected pixels. Inspect the first and last frames and watch each export from the README or the Hugo preview. Check mobile and desktop playback, readable captions and the saved-copy link. Keep account names, tenant addresses and deployment names outside the frame.

## Start locally

Use Node 22.14 or later in the 22.x line. From a fresh checkout, install each package's locked dependencies once. For later test runs, use the last command.

```sh
npm --prefix backend ci
npm --prefix spfx ci
npm test
```

The backend tests use simulated Foundry responses. The SharePoint Framework (SPFx) tests cover launcher visibility and navigation, gallery metadata, segmentation, edit order and service errors. For package `1.4.1.5`, the production build passed all 29 SPFx tests. The 17 backend tests passed for Function `0.5.2` in the preceding release.

## Prepare the browser check

Open the test site's root address in a new tab. Confirm Imageo opens on the site's configured welcome page. Follow a link to a document library, then use the site's own navigation to return to a modern page and open Imageo again. Check the welcome page's direct link separately. Record the original address as well as the page SharePoint displayed.

- Upload the [picture with two red markers](./fixtures/regatta-buoys.png) to a library on the test site. This 1024 × 768 PNG is the source used for the recorded removal. Select the left marker and use the right marker to check which pixels Imageo preserved. You can also reuse this file for the resize test.
- For a **fixture** run, use a test page with simulated SharePoint and model responses. Capture request bodies in the harness. Supply synthetic pictures, two page sections, and a recorded or simulated model result. Use the error cases below to exercise response handling.
- For a **live** run, open an approved test site as an author who can read the input pictures and save a copy in Site Assets. Record the installed package version. Use a PNG or JPEG with two similar, separated objects and a landscape image with easily identifiable colours. Record each original's filename, dimensions and checksum.
- Record the controls, the selected area and the resulting copy. Keep addresses, account names, deployment details and unrelated library items outside public captures. A screenshot establishes how the pane looked. A downloaded PNG establishes its dimensions and transparency.

## Run the author tasks

| Task | Actions | Pass condition and evidence |
|---|---|---|
| Create a news banner | Open **Create**. Select **Wide banner** and **Transparent background**. Ask for an orange sailboat on a transparent background. Generate and save it. Choose **Refine**, ask for a green sail, apply the edit and save the second picture. | Download both PNGs. The original measures 2048 × 1152 and contains transparent pixels. Record the size and transparency of the edit separately. Compare both sails and verify the original checksum. [Generate a banner](../assets/imageo-demo.gif) · [Quick Refine](../assets/imageo-quick-refine-demo.gif) |
| Remove one marker | In **Gallery**, select the picture with two red markers and choose **Refine → Object → Remove object**. Click the left marker. Confirm that the stripes and thumbnail mark it. Select **Send** and **Compare with original**. Choose **Show result → Save as copy**. | The selected marker disappears. Inspect the water around its former outline and the second marker. For the recorded fixture, the entire right half matched the source pixel for pixel. [Original, editor selection, guide and saved result](../assets/imageo-object-removal.png) |
| Recolour part of a picture | Open the sailboat in the editor. Choose **Object → Change colour**. Enter a hex colour or use **Sample new colour**. Select only the sail, check the instruction, and send. Compare and save. | The chosen sail changes, while the hull stays intact. Sample an interior sail pixel and a protected hull pixel. Record requested and observed colours separately. Shading can change the sampled value. [Gallery-to-editor walkthrough](../assets/imageo-editor-demo.gif) |
| Make a reusable product cutout | Open a JPEG of a spare part. Mark the part, touch up the selection with the brush, and choose **Background → Make background transparent → Apply locally**. Save as a copy and place it on light and dark backgrounds. | The page background shows through the area outside the part. Inspect fine edges against both colours. Check transparent pixels in the downloaded PNG and the original JPEG's checksum. This is a proposed author test. |
| Resize a library copy | Open a 1024 × 768 PNG. Choose **Resize image**, keep proportions and enter width 512. Select **Apply size → Apply locally → Save as copy**. Reopen the original, queue width 320, then choose **Image → Crop → Square · 1:1**. Apply locally and save. | Download both copies. Expect 512 × 384 and 320 × 320. Compare an edge before and after the square crop, check a transparent patch if the input has one, and verify the original checksum. A fixture run should record zero image-model requests. |

For PNG measurements, any image inspector that reports dimensions and pixel opacity works. If ImageMagick is available, run this on the downloaded files.

```sh
magick identify -format '%f %wx%h opaque=%[opaque]\n' original.png edited.png
```

For the marker test, save the downloaded edit as `removed-buoy.png` in the repository root. This command counts changed pixels in the right half. Expect `0` for a removal confined to the left marker.

```sh
magick tests/fixtures/regatta-buoys.png removed-buoy.png -crop 512x768+512+0 +repage -metric AE -compare -format '%[distortion]\n' info:
```

## Exercise controls and failures

| Check | Actions and expected result |
|---|---|
| Retry uses the original settings | Generate and save a wide transparent banner. Change the Create controls to a small square with transparency off, then select **Retry** on the banner. Check that the request still uses the original prompt, banner size and transparent background. Inspect the new PNG's actual dimensions and alpha. |
| Solid background and replacement scene | Mark the product in the cutout example. Try **Solid background** with a known colour and apply locally. Check a background pixel and an interior product pixel. Reopen the original, choose **Replace scene**, ask for a workshop bench and select **Send**. Confirm the instruction targets the area outside the marked subject. Compare the product with the source before saving. |
| Gallery | Place a PNG, a `.jpg`, and a `.jpeg` across two folders. Select a file on a later page, then choose **File type → JPEG**. Expect page one, both JPEG extensions across the results, and a disabled **Refine** until you select again. Combine the filter with a name search and a date sort. Enter a folder under **Browse libraries** and check its contents. An empty search result disables file actions. [Gallery](../assets/imageo-site-gallery.png) |
| Keyboard and selection | Tab to a tool. Focus the picture and use arrow keys and Enter to mark a region. Switch to **Add brush** or **Erase brush**, change the brush size and paint a correction. Check the thumbnail. Turn on reduced motion and verify the outline stays still and the stripes remain visible. Remove the final instruction and check keyboard focus returns to **Additional instruction**. |
| Luna and page scope | Type a brief or choose a completed model preset. Select **Suggest an instruction**. The reply fills the editable field. In **Create**, analyse one selected page section and repeat from the gallery. The summary starts unchecked. Check **Include page summary** to preview and share it. Change the section selection before re-opening the editor. The old summary should no longer be offered. In a fixture, verify that the suggestion request contains text and that the image-edit route has zero calls until **Send**. |
| Failure and recovery | In a fixture, return HTTP 503 for the suggestion, then return a successful suggestion on retry. Expect the brief to survive the failure. Delay another response and type newer text. The old response must leave that text intact. Separately, return a structured HTTP 400 output-filter response for an image edit. Expand **Service response**, then retry with a successful response. The error should clear and the result should appear. |

## Evidence from this release

| Scenario | Completed | Still to verify on a fresh live run |
|---|---|---|
| Site root and navigation | After the `1.4.1.5` upgrade, the author confirmed that opening the normal site root in a fresh Edge tab showed the launcher and opened the gallery. The site's configured welcome page had a different name from Home.aspx. Automated tests covered delayed page data, navigation and visible placeholder replacement. | Repeat the library-to-page navigation in a live session when testing another site layout. |
| Page prompts and Retry | In a recording of the shipped component, the author selected the race story and left out the meeting notes. The backend sent that section to Luna and returned a new suggested prompt. The Retry recording used two retained 2048 × 1152 transparent banners and verified that the second request carried the first request’s size and transparency. | Repeat the page-to-prompt step on a real page if verifying a site's page content or permissions. |
| Luna followed by a picture edit | The author asked for a more visible sail. The backend received fresh wording from Luna. Pressing Send in the editor produced the request used for a fresh MAI edit. The returned sail was a darker green. The recording replays those two responses in the same order. | If testing another deployment, check that reviewing the wording makes no image request until Send. |
| Change the scene or prepare a copy | The editor marked one red marker to keep. MAI returned a mountain lake at sunrise. The saved result preserved all 1,400 sampled pixels inside the marker. Separate browser runs saved a transparent cutout, a solid background, a 349 × 349 crop and a 512 × 384 resized copy in the sample gallery. | Saving those particular variants into a live SharePoint library is a separate check. |
| Banner and quick refine | Retained test-site images both measured 2048 × 1152. The orange original had transparent pixels. The green edit was opaque. | Repeat generation and quick refine on this package if these actions are part of the live showcase. |
| Object removal and recolour | The current editor replayed a retained MAI response for the picture with two red markers. Source, guide and saved pixels matched the earlier run. A previous live sail recolour requested `#7B235F` and sampled near `#A33084`. The navy hull and outer white area were preserved. | Run a new removal on the current test site for a fresh end-to-end model result. |
| Mark and correct a selection | The selection recording used the red marker. An 18 px brush extended the highlight. The erase brush reduced it, and clearing the selection removed it. The source picture matched its starting pixels throughout. | Repeat with touch input if testing on a tablet. |
| Resize and gallery | Browser fixtures verified both saved sizes through upload and download, checked the sampled colours and transparency, and exercised filters and pagination. A live editor saved a 2048 × 1152 image as a 1024 × 576 PNG and the downloaded size was verified. | Combine crop and resize on the current site. Exercise all file types and sort directions there. |
| Selection, suggestions and failures | Reduced motion and selection visibility passed in browser fixtures. A live Luna request produced an editable sail-and-rigging instruction. Fixture runs verified optional summary contents, stale-response handling and recovery after a suggestion failure. | Repeat keyboard-only authoring in the target browser and include the explicit summary opt-in in a live demonstration if required. |
