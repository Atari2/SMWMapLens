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
<b>Search in RAM</b>
</button>
<button
    on:click={() => {
        tsvscode.postMessage({
            type: 'rom',
            value: text
        });
    }}>
<b>Search in ROM</b>
</button>
