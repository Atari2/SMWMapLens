<script lang="ts">
    let text = "";
</script>

<input bind:value={text}/>

<button
    on:click={() => {
        tsvscode.postMessage({
            type: 'ram',
            value: text
        });
    }}>
Search in RAM
</button>
<button
    on:click={() => {
        tsvscode.postMessage({
            type: 'rom',
            value: text
        });
    }}>
Search in ROM
</button>
