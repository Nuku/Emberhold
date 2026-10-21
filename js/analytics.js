// Page-view analytics for the hosted GitHub Pages site.
(() => {
  const websiteId = '3e27737c-c763-4d68-90ea-38889d6d0d50';
  if (!websiteId) return;

  const tracker = document.createElement('script');
  tracker.defer = true;
  tracker.src = 'https://cloud.umami.is/script.js';
  tracker.dataset.websiteId = websiteId;
  tracker.dataset.domains = 'nuku.github.io';
  document.head.appendChild(tracker);
})();
