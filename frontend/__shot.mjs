import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1180, height: 420 } });
await p.goto("file:///d:/Office_File/other/CodeTrack/frontend/dist/__rowcheck.html");
await p.screenshot({ path: "d:/Office_File/other/CodeTrack/frontend/dist/__rowcheck.png", fullPage: true });
await b.close();
