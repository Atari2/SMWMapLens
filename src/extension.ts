// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SidebarProvider, Address, AddressRange } from "./sideBarProvider";
import { JSDOM } from 'jsdom';

const axios = require('axios').default;
const CACHE_LIMIT = 3000;
const getmapUrl = 'https://www.smwcentral.net/ajax.php?a=getmap&m=';
let cacheMap: Map<string, vscode.MarkdownString> = new Map();
function parseAddress(value: object): AddressRange {
    return new AddressRange(new Address(value));
}

async function getMap(name: string): Promise<Array<AddressRange>> {
    let fullUrl = `${getmapUrl}${name}`;
    let response = await axios.get(fullUrl);
    if (response.status !== 200) {
        vscode.window.showErrorMessage("Impossible to download ram map from SMWCentral, check your internet connection.");
        throw new Error('Impossible to get ram map');
    }
    return response.data.map((x: object) => parseAddress(x));
}
const LINK_PATTERN = /\[url=(.*?)\](.*?)\[\/url\]|<a href=\"(.+?)\">(.+?)<\/a>/g;
const CODE_PATTERN = /\[code(?:=text)?\](.+?)\[\/code\]|<code>(.+?)<\/code>/g;
const USER_PATTERN = /\[user=(\d+)(?: simple)?\]/g;
const SIZE_PATTERN = /\[size=\d+](.+?)\[\/size]/g;
function reSubLinkCallback(match: string, p1: string, p2: string, p3: string, p4: string, offset: number, string: string, groups: object): string {
    if (p1 !== undefined && p2 !== undefined) {
        return `[${p2}](${p1})`;
    } else if (p3 !== undefined && p4 !== undefined) {
        return `[${p4}](${p3})`;
    } else {
        return '';
    }
}
function reSubCodeCallback(match: string, p1: string, p2: string, offset: number, string: string, groups: object): string {
    if (p1 !== undefined) {
        if (p1.includes('\n')) {
            return `\`\`\`\n${p1}\n\`\`\``;
        } else {
            return `\`${p1}\``;
        }
    } else if (p2 !== undefined) {
        if (p2.includes('\n')) {
            return `\`\`\`\n${p2}\n\`\`\``;
        } else {
            return `\`${p2}\``;
        };
    } else {
        return '';
    }
}
function reSubUserCallback(match: string, p1: string, offset: number, string: string, groups: object): string {
    if (p1 !== undefined) {
        return `[user ${p1}](https://www.smwcentral.net/?p=profile&id=${p1})`;
    } else {
        return '';
    }
}
function reSubSizeCallback(match: string, p1: string, offset: number, string: string, groups: object): string {
    return p1;
}
function cleanDescription(desc: string): string {
    let description = desc.replace(LINK_PATTERN, reSubLinkCallback);
    description = description.replace(CODE_PATTERN, reSubCodeCallback);
    description = description.replace(USER_PATTERN, reSubUserCallback);
    description = description.replace(SIZE_PATTERN, reSubSizeCallback);
    const doc = new JSDOM(description);
    description = doc.window.document.body.textContent || "";
    description = description.replace(/\n/g, "\n\n");
    return description;
}
function sortBySizeAsc(addressRanges: Array<AddressRange>): Array<AddressRange> {
  return addressRanges.sort((ar1, ar2) => {
    if (ar1.addr.size < ar2.addr.size) return -1;
    if (ar1.addr.size > ar2.addr.size) return 1;
    return 0;
  })
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    let ramMap: Array<AddressRange> = sortBySizeAsc(await getMap('smwram'));
    let romMap: Array<AddressRange> = sortBySizeAsc(await getMap('smwrom'));
    let regsMap: Array<AddressRange> = sortBySizeAsc(await getMap('smwregs'));
    let hijacksMap: Array<AddressRange> = sortBySizeAsc(await getMap('smwhijack'));
    const sidebarProvider = new SidebarProvider(context.extensionUri, ramMap, romMap);
    console.log('Congratulations, your extension "smwmaplens" is now active!');
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("smwlens-search", sidebarProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("smwmaplens.clearCache", () => {
            cacheMap.clear();
        })
    );


    let re = /(?:[^#]|^)[$!]([0-9A-Fa-f]{2,6})/g;
    let reTrailingWhitespaceOrComment = /(\s|;)+$/;
    vscode.languages.registerHoverProvider('assembly', {
        provideHover(document, position, _) {
            const range = document.getWordRangeAtPosition(position);
            if (typeof range === 'undefined') {
                return;
            }
            if (range.start.line !== range.end.line) {
                // we don't care about multiline
                return;
            }

            let realRange = range.end.character - range.start.character;
            // get 2 chars before the start and after the end of the range to see what we're checking
            let mutRange: vscode.Range;
            try {
                mutRange = new vscode.Range(range.start.translate(0, -2), range.end.translate(0, 2));
            } catch (error) {
                // if we can't get 2 chars before the start, get 1 char before and 2 after
                mutRange = new vscode.Range(range.start.translate(0, -1), range.end.translate(0, 2));
            }
            let word = document.getText(mutRange).replace(reTrailingWhitespaceOrComment, "");
            let originalWord = word;
            let tryCache = cacheMap.get(originalWord);
            if (tryCache !== undefined) {
                if (cacheMap.size > CACHE_LIMIT) {
                    cacheMap.clear();
                }
                return new vscode.Hover(tryCache);
            }
            let ifregistermayberom = false;
            // if word was trimmed and still ends with ,x || ,y, trim it
            if ((word.endsWith(',x') || word.endsWith(',y')) && realRange !== word.length - 2) {
                word = word.substring(0, word.length - 2);
                ifregistermayberom = true;
            }
            word = word.trimEnd();
            let match = re.exec(word);
            if (match === null) {
                return;
            }
            let realAddress = match[1];
            if (realAddress.length % 2 !== 0) {
                return;
            }
            let isrom = false;
            let isregister = false;
            switch (realAddress.length) {
                case 2:
                    realAddress = '00' + realAddress;
                case 4:
                    if (Number.parseInt(realAddress, 16) <= 0x1FFF) {
                        realAddress = '7E' + realAddress;
                    } else {
                        isregister = !ifregistermayberom;
                        if (isregister) {
                            break;
                        } else {
                            realAddress = '00' + realAddress;
                        }
                    }
                case 6:
                    if (realAddress[0] === '0') {
                        isrom = true;
                    }
                    break;
                default:
                    throw new Error('Parameter is not correct length');
            }
            let address = Number.parseInt(realAddress, 16);
            let val: AddressRange | undefined = undefined;
            let hijacks: AddressRange[] = [];
            let firstIsHijack: boolean = false;
            if (isregister) {
                val = regsMap.find(x => address >= x.begin && address < x.end);
            } else if (isrom) {
                val = romMap.find(x => address >= x.begin && address < x.end);
                // check if it's a hijack
                hijacks = hijacksMap.filter(x => address >= x.begin && address < x.end);
                for (const h of hijacks) {
                    h.addr.description = cleanDescription(h.addr.description);
                }
                if (val === undefined && hijacks.length > 0) {
                    val = hijacks.pop();
                    firstIsHijack = true;
                    if (val !== undefined) {
                        val.addr.description = `**Hijacks:**\n\n` + val.addr.description;
                    }
                }
            } else {
                val = ramMap.find(x => address >= x.begin && address < x.end);
            }
            if (val === undefined) {
                return new vscode.Hover(new vscode.MarkdownString("Nothing found"));
            }
            val.addr.description = cleanDescription(val.addr.description);
            let mrkstr = new vscode.MarkdownString();
            let infoStr: string = "";
            if (val.addr.details === undefined) {
                infoStr = val.addr.size > 1 ?
                    `${val.addr.description}  \nStarts at $${val.begin.toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')} and ends at $${(val.end - 1).toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')}.`
                    :
                    val.addr.description;
                if (hijacks.length > 0 && !firstIsHijack) {
                    infoStr += `  \n\n**Hijacks:**`;
                }
                for (const hj of hijacks) {
                    infoStr += `  \n${hj.addr.description}  \nStarts at $${hj.begin.toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')} and ends at $${(hj.end - 1).toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')}.`;
                }
            } else {
                let links: Array<string> = new Array();
                for (let [linkid, desc] of Object.entries(val.addr.details)) {
                    let validValuesLink = `https://www.smwcentral.net/?p=memorymap&a=detail&game=smw&region=${isrom ? 'rom' : 'ram'}&detail=${linkid}`;
                    let href = `[${desc}](${validValuesLink})`;
                    links.push(href);
                }
                let fullDetails = links.join('  \n');
                infoStr =
                    val.addr.size > 1 ?
                        `${val.addr.description}  \n${fullDetails}  \nStarts at $${val.begin.toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')} and ends at $${(val.end - 1).toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')}.`
                        :
                        `${val.addr.description}  \n${fullDetails}`;
                if (hijacks.length > 0 && !firstIsHijack) {
                    infoStr += `  \n\n**Hijacks:**`;
                }
                for (const hj of hijacks) {
                    infoStr += `  \n${hj.addr.description}  \nStarts at $${hj.begin.toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')} and ends at $${(hj.end - 1).toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')}.`;
                }
            }
            mrkstr = mrkstr.appendMarkdown(infoStr);
            cacheMap.set(originalWord, mrkstr);
            return new vscode.Hover(mrkstr);
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() { }
