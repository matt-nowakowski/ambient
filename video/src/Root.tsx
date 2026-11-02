import React from "react";
import { Composition } from "remotion";
import { Ad, Poster, type PosterProps } from "./Ad";
import { FPS, H, TOTAL, W } from "./beats";
import { Sheet, type SheetProps } from "./Sheet";

export const Root: React.FC = () => (
  <>
    <Composition id="Launch" component={Ad} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    {/* 9:16 social cut: the same shots, laid out for a tall frame. */}
    <Composition id="LaunchVertical" component={Ad} durationInFrames={TOTAL} fps={FPS} width={H} height={W} />
    {/* Posters for the site embed: render with --props='{"theme":"dark"}' for the dark page. */}
    <Composition id="Poster" component={Poster} durationInFrames={1} fps={FPS} width={W} height={H} defaultProps={{ theme: "light" } satisfies PosterProps} />
    <Composition id="PosterVertical" component={Poster} durationInFrames={1} fps={FPS} width={H} height={W} defaultProps={{ theme: "light" } satisfies PosterProps} />
    <Composition
      id="Sheet"
      component={Sheet}
      durationInFrames={1}
      fps={FPS}
      width={1920}
      height={1100}
      defaultProps={{ from: 0, step: 15, cols: 6, rows: 6, tall: false } satisfies SheetProps}
    />
  </>
);
