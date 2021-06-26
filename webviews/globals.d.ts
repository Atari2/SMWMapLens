import * as _vscode from "vscode";
import 'svelte';

declare global {
    const tsvscode: {
        postMessage: ({type: string, value: any}) => void;
    }
    const searchResult: string;
}