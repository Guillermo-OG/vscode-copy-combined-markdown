import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

function getUrisFromCommandArgs(...args: any[]): vscode.Uri[] {
  if (args.length > 1 && Array.isArray(args[1]) && args[1].length > 0) {
    return args[1].filter(
      (arg): arg is vscode.Uri => arg instanceof vscode.Uri
    );
  }

  const candidates = args.flat(Infinity);
  const uris = candidates
    .map((item) => {
      if (item instanceof vscode.Uri) {
        return item;
      }
      if (item && item.resourceUri instanceof vscode.Uri) {
        return item.resourceUri;
      }
      return null;
    })
    .filter((uri): uri is vscode.Uri => uri !== null);

  const uniqueUriStrings = [...new Set(uris.map((uri) => uri.toString()))];
  return uniqueUriStrings.map((str) => vscode.Uri.parse(str));
}

const expandDirectories = (fileUris: string[]): string[] => {
  let expandedFileUris: string[] = [];
  for (const uri of fileUris) {
    try {
      if (fs.existsSync(uri) && fs.lstatSync(uri).isDirectory()) {
        const files = fs.readdirSync(uri).map((file) => path.join(uri, file));
        expandedFileUris = expandedFileUris.concat(expandDirectories(files));
      } else if (fs.existsSync(uri)) {
        expandedFileUris.push(uri);
      }
    } catch (e) {
      console.warn(
        `[Copy Combined Markdown] Could not process path: ${uri}`,
        e
      );
    }
  }
  return expandedFileUris;
};

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "copy-combined-markdown.copy",
    async (...args: any[]) => {
      try {
        const urisToProcess = getUrisFromCommandArgs(...args);

        if (urisToProcess.length === 0) {
          vscode.window.showInformationMessage(
            "No valid files were found to process."
          );
          return;
        }

        const paths = urisToProcess.map((uri) => uri.fsPath);
        const uniqueFileUris = [...new Set(expandDirectories(paths))];

        const combinedMarkdownArray = await Promise.all(
          uniqueFileUris.map(async (filePath) => {
            if (
              !fs.existsSync(filePath) ||
              fs.lstatSync(filePath).isDirectory()
            ) {
              return null;
            }

            const languageId = await vscode.workspace
              .openTextDocument(filePath)
              .then(
                (doc) => doc.languageId,
                () => "plaintext"
              );
            const content = await fs.promises.readFile(filePath, "utf8");

            const longestSequence = content
              .match(/`{3,}/g)
              ?.reduce((a, b) => (a.length > b.length ? a : b));
            const numberOfBackticks = longestSequence
              ? longestSequence.length + 1
              : 3;
            const backticks = "`".repeat(numberOfBackticks);

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(
              vscode.Uri.file(filePath)
            );
            const workspacePath = workspaceFolder
              ? workspaceFolder.uri.fsPath
              : "";

            const relativePath = workspacePath
              ? path.relative(workspacePath, filePath)
              : filePath;
            const normalizedPath = `./${relativePath.replace(/\\/g, "/")}`;

            return `${normalizedPath}\n${backticks}${languageId}\n${content}\n${backticks}\n`;
          })
        );

        const filteredArray = combinedMarkdownArray.filter(
          (item): item is string => item !== null
        );

        if (filteredArray.length === 0) {
          vscode.window.showInformationMessage(
            "No text files were found to copy."
          );
          return;
        }

        const combinedMarkdown = filteredArray.join("\n");
        await vscode.env.clipboard.writeText(combinedMarkdown);
        vscode.window.showInformationMessage(
          `Combined markdown for ${filteredArray.length} file${
            filteredArray.length !== 1 ? "s" : ""
          } copied to clipboard!`
        );
      } catch (error: any) {
        console.error("Copy Combined Markdown Error:", error);
        vscode.window.showErrorMessage(
          `An unexpected error occurred: ${error.message}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
