import * as vscode from "vscode";
import { getNonce } from "get-nonce";
import { marked } from 'marked';

export function prepareMarkdownString(description: string): string {
    // escape bbcode
    const reg = /\[url=(.*?)\](.*?)\[\/url\]/gs;
    const href = /<a href="(.*?)">(.*?)<\/a>/gs;
    const codeReg = /\[code\](.*?)\[\/code\]/gs;
    description = description.replace('\n', '  \n');
    description = description.replace(reg, `[$2]($1)`);
    description = description.replace(href, `[$2]($1)`);
    description = description.replace(codeReg, `  \n\`\`\`plaintext\n$1\n\`\`\`  \n`);
    return description;
}


export class Address {
    address: string = "";
    size: number = 0;
    context: string | null = null;
    type: string = "";
    description: string = "";
    details: object | undefined;
    constructor(jsonObject: object) {
        Object.assign(this, jsonObject);
        this.size = Number.parseInt(this.size.toString());
        this.description = prepareMarkdownString(this.description);
    }
}

export class AddressRange {
    begin: number;
    end: number;
    addr: Address;
    constructor(addr: Address) {
        this.begin = Number.parseInt(addr.address.substring(1), 16);
        this.end = this.begin + addr.size;
        this.addr = addr;
    }
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    ramMap: Array<AddressRange>;
    romMap: Array<AddressRange>;
    hexValidate = /^\$?([a-fA-F0-9]{0,6})/;
    searchResult: string;
    constructor(private readonly _extensionUri: vscode.Uri, ramMap: Array<AddressRange>, romMap: Array<AddressRange>) {
        this.ramMap = ramMap;
        this.romMap = romMap;
        this.searchResult = "";
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (!data.value) {
                this.searchResult = "";
                return;
            }
            let match = this.hexValidate.exec(data.value);
            if (match === null) {
                vscode.window.showErrorMessage('Invalid address');
                this.searchResult = "Invalid address";
                return;
            }
            let strAddr = match[1];
            strAddr = strAddr.padStart(4, '0');
            if (strAddr.length === 4) {
                if (data.type === 'ram') {
                    strAddr = '7E' + strAddr;
                } else {
                    strAddr = '00' + strAddr;
                }
            }
            let addr = Number.parseInt(strAddr, 16);
            switch (data.type) {
                case "ram": {
                    let val = this.ramMap.find(x => addr >= x.begin && addr < x.end);
                    if (val === undefined) {
                        this.searchResult = "Nothing found";
                    } else {
                        this.searchResult = val.addr.description;
                    }
                    // vscode.window.showInformationMessage(val.addr.description);
                    break;
                }
                case "rom": {
                    let val = this.romMap.find(x => addr >= x.begin && addr < x.end);
                    if (val === undefined) {
                        this.searchResult = "Nothing found";
                    } else {
                        this.searchResult = val.addr.description;
                    }
                    // vscode.window.showInformationMessage(val.addr.description);
                }
            }
            this.searchResult = await marked(this.searchResult);
            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        });
    }

    public revive(panel: vscode.WebviewView) {
        this.searchResult = "";
        this._view = panel;
        this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
        );
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
        );

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "out", "compiled/SideBar.js")
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "out", "compiled/SideBar.css")
        );

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource
            }; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">
        <script nonce="${nonce}">
          const tsvscode = acquireVsCodeApi();
        </script>
            </head>
            <body>
            <script nonce="${nonce}" src="${scriptUri}"></script>
            <div>
            <hr />
            ${this.searchResult}
            </div>
            </body>
            </html>`;
    }
}