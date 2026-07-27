import type { InngestFunction } from "inngest";

import { dataRetention } from "./data-retention.js";

// All inngest functions — passed to the serve handler in index.ts.
export const inngestFunctions: InngestFunction.Any[] = [dataRetention];
