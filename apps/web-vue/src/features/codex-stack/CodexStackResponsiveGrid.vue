<template>
  <div class="cs-responsive-grid">
    <slot />
  </div>
</template>

<style scoped>
.cs-responsive-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

@media (max-width: 960px) {
  .cs-responsive-grid {
    grid-template-columns: 1fr;
  }
}
</style>
