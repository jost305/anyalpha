import { Buffer } from "buffer/";
import "./index.css";

const browserGlobal = globalThis as unknown as { Buffer?: typeof Buffer };

if (!browserGlobal.Buffer) {
  browserGlobal.Buffer = Buffer;
}

void import("./bootstrap");
