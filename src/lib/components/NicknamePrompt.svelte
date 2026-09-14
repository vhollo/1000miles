<script lang="ts">
	import Modal from './Modal.svelte';
	import { partners } from '$lib/partners/store.svelte';
	import { MAX_NAME } from '$lib/push/validate';

	let {
		open = false,
		title = 'What should we call you?',
		onsave
	}: { open?: boolean; title?: string; onsave?: () => void } = $props();

	let value = $state('');

	// Seed from the stored name each time the prompt is opened.
	$effect(() => {
		if (open) value = partners.identity.name;
	});

	function save() {
		partners.setName(value);
		onsave?.();
	}
</script>

<Modal {open} labelledby="nickname-title">
	<h2 id="nickname-title" class="font-display text-xl font-black text-asphalt">{title}</h2>
	<p class="mt-1 text-sm text-asphalt/60">
		Your partner sees this name on the board and on their invitations.
	</p>
	<input
		bind:value
		maxlength={MAX_NAME}
		autocomplete="nickname"
		placeholder="Anna"
		onkeydown={(e) => e.key === 'Enter' && value.trim() && save()}
		class="mt-3 w-full rounded-xl bg-white py-3 text-center font-display text-2xl font-black text-asphalt outline-none ring-amber-300 focus:ring-2"
	/>
	<button
		onclick={save}
		disabled={!value.trim()}
		class="mt-3 w-full rounded-2xl bg-violet-500 px-4 py-3 font-display font-bold text-white shadow-[0_4px_0_#6d28d9] transition active:translate-y-0.5 active:shadow-none disabled:bg-gray-400 disabled:shadow-none"
	>
		That's me
	</button>
</Modal>
