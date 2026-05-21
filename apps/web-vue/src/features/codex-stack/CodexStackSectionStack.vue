<template>
  <section class="cs-section-stack">
    <slot />
  </section>
</template>

<style scoped>
.cs-section-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
</style>
