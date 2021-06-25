// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const axios = require('axios').default;

const getmapUrl = 'https://www.smwcentral.net/ajax.php?a=getmap&m=';

function prepareMarkdownString(description: string): string {
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


class Address {
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

class AddressRange {
    begin: number;
    end: number;
    addr: Address;
    constructor(addr: Address) {
        this.begin = Number.parseInt(addr.address.substring(1), 16);
        this.end = this.begin + addr.size;
        this.addr = addr;
    }
}

function parseAddress(value: object) : AddressRange {
    return new AddressRange(new Address(value));
}

async function getMap(name: string) : Promise<Array<AddressRange>> {
    let fullUrl = `${getmapUrl}${name}`;
    let response = await axios.get(fullUrl);
    if (response.status !== 200) {
        throw new Error('Impossible to get ram map');
    }
    return response.data.map((x: object) => parseAddress(x));
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(_: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "testextension" is now active!');

    // let jsonstr = await getRamMap();//readFileSync('D:\\aless\\Documents\\GitHub\\testextension\\out\\maps\\ram_map.json', 'utf8');
    let ramMap: Array<AddressRange> = await getMap('smwram');
    let romMap: Array<AddressRange> = await getMap('smwrom');
    let regsMap: Array<AddressRange> = await getMap('smwregs');
    let re = /[^#][$!]([0-9A-Fa-f]{2,6})/g;
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
            let mutRange = new vscode.Range(range.start.translate(0, -2), range.end.translate(0, 2));
            let word = document.getText(mutRange).trimEnd();
            let ifregistermayberom = false;
            // if word was trimmed and still ends with ,x || ,y, trim it
            if ((!word.endsWith(',x') || !word.endsWith(',y')) && realRange !== word.length - 2) {
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
            if (isregister) {
                val = regsMap.find(x => address >= x.begin && address < x.end);
            } else if (isrom) {
                val = romMap.find(x => address >= x.begin && address < x.end);
            } else {
                val = ramMap.find(x => address >= x.begin && address < x.end);
            }
            if (val === undefined) {
                return;
            }
            if (val.addr.details === undefined) {
                let mrkstr = new vscode.MarkdownString();
                return new vscode.Hover(mrkstr.appendMarkdown(
                    val.addr.size > 1 ?
                        `${val.addr.description}  \nStarts at $${val.begin.toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')} and ends at $${(val.end - 1).toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')}.`
                        :
                        val.addr.description
                ));
            } else {
                let links: Array<string> = new Array();
                for (let [linkid, desc] of Object.entries(val.addr.details)) {
                    let validValuesLink = `https://www.smwcentral.net/?p=memorymap&a=detail&game=smw&region=${isrom ? 'rom' : 'ram'}&detail=${linkid}`;
                    let href = `[${desc}](${validValuesLink})`;
                    links.push(href);
                }
                let fullDetails = links.join('  \n');
                let mrkstr = new vscode.MarkdownString();
                return new vscode.Hover(mrkstr.appendMarkdown(
                    val.addr.size > 1 ?
                        `${val.addr.description}  \n${fullDetails}  \nStarts at $${val.begin.toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')} and ends at $${(val.end - 1).toString(16).toUpperCase().padStart(isregister ? 4 : 6, '0')}.`
                        :
                        `${val.addr.description}  \n${fullDetails}`
                ));
            }
        }
    });

}

// this method is called when your extension is deactivated
export function deactivate() { }
