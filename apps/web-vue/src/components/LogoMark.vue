<template>
  <svg
    class="logo-mark"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="oc-orb" x1="12" y1="8" x2="33" y2="20" gradientUnits="userSpaceOnUse">
        <stop stop-color="var(--logo-mark-orb-start)" />
        <stop offset="1" stop-color="var(--logo-mark-orb-end)" />
      </linearGradient>
      <linearGradient id="oc-ridge-back" x1="11" y1="18" x2="36" y2="35" gradientUnits="userSpaceOnUse">
        <stop stop-color="var(--logo-mark-ridge-back-start)" />
        <stop offset="1" stop-color="var(--logo-mark-ridge-back-end)" />
      </linearGradient>
      <linearGradient id="oc-ridge-front" x1="10" y1="24" x2="38" y2="39" gradientUnits="userSpaceOnUse">
        <stop stop-color="var(--logo-mark-ridge-front-start)" />
        <stop offset="1" stop-color="var(--logo-mark-ridge-front-end)" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="44" height="44" rx="14" fill="var(--logo-mark-frame-fill)" stroke="var(--logo-mark-frame-border)" />
    <circle cx="30" cy="16" r="4.8" fill="url(#oc-orb)" opacity="0.96" />
    <path d="M10 34.8C13.5 30.1 17 25.8 20.8 21.8C23.2 24.2 25.1 26.5 26.6 28.9C29.1 25.4 32 21.8 35.5 18.7C38.4 22 40.6 25.3 42 28.8V38H10V34.8Z" fill="url(#oc-ridge-back)" />
    <path d="M9 38C12.2 34.5 15.8 31.6 19.7 29.2C22.6 30.8 25 32.5 27 34.5C29.8 31.5 33 28.9 36.9 26.8C39.9 28.6 42.3 30.8 44 33.3V38H9Z" fill="url(#oc-ridge-front)" />
    <path d="M21.1 22.3L24 18.1L26.9 22.3H21.1Z" fill="var(--logo-mark-peak-fill)" opacity="0.96" />
  </svg>
</template>
