import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setConcurrency(6);

// Reuse a local headless Chrome when one is set (saves a download); otherwise Remotion fetches its own.
if (process.env.REMOTION_CHROME) Config.setBrowserExecutable(process.env.REMOTION_CHROME);
