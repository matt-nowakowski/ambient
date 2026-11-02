// Word timings for each voice fragment (written by scripts/voice.mjs).
import type { Vo } from "./timeline";
import speak from "../public/vo/speak.json";
import writes from "../public/vo/writes.json";
import answers from "../public/vo/answers.json";
import acts from "../public/vo/acts.json";
import remembers from "../public/vo/remembers.json";
import hey from "../public/vo/hey.json";
import notes from "../public/vo/notes.json";
import nobot from "../public/vo/nobot.json";
import anyapp from "../public/vo/anyapp.json";
import nothing from "../public/vo/nothing.json";
import privacy from "../public/vo/private.json";
import meet from "../public/vo/meet.json";
import free from "../public/vo/free.json";

const vo: Record<string, Vo> = { speak, writes, answers, acts, remembers, hey, notes, nobot, anyapp, nothing, private: privacy, meet, free };
export default vo;
