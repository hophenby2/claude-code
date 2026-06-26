import { AgentTool } from "../AgentTool/AgentTool.js";
import { BashTool } from "../BashTool/BashTool.js";
import { FileEditTool } from "../FileEditTool/FileEditTool.js";
import { FileReadTool } from "../FileReadTool/FileReadTool.js";
import { FileWriteTool } from "../FileWriteTool/FileWriteTool.js";
import { GlobTool } from "../GlobTool/GlobTool.js";
import { GrepTool } from "../GrepTool/GrepTool.js";
import { NotebookEditTool } from "../NotebookEditTool/NotebookEditTool.js";
let _primitiveTools;
function getReplPrimitiveTools() {
  return _primitiveTools ??= [
    FileReadTool,
    FileWriteTool,
    FileEditTool,
    GlobTool,
    GrepTool,
    BashTool,
    NotebookEditTool,
    AgentTool
  ];
}
export {
  getReplPrimitiveTools
};
