const CACHE_NAME = 'period-tracker-v1.0.0';
const APP_VERSION = '1.0.0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './script.js',
  './icon-16.png',
  './icon-29.png',
  './icon-40.png',
  './icon-60.png',
  './icon-76.png',
  './icon-120.png',
  './icon-152.png',
  './icon-167.png',
  './icon-180.png'
];

// iOS-specific: Detect if running as standalone app
const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true;
};

// Install event - cache resources (hanushlasky-style)
self.addEventListener('install', event => {
  console.log('Service Worker installing... Version:', APP_VERSION);
  console.log('Cache name:', CACHE_NAME);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        console.log('Caching URLs:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('All resources cached successfully');
      })
      .catch(error => {
        console.error('Failed to cache resources:', error);
      })
  );
  
  // Force immediate activation - critical for iOS PWA updates
  console.log('Forcing immediate activation with skipWaiting()');
  self.skipWaiting();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Network request with fallback
        return fetch(event.request)
          .then(fetchResponse => {
            // Check if valid response
            if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
              return fetchResponse;
            }
            
            // Clone response for caching
            const responseToCache = fetchResponse.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return fetchResponse;
          })
          .catch(() => {
            // Return cached index.html for navigation requests when offline
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// Activate event - clean up old caches and handle updates (hanushlasky-style)
self.addEventListener('activate', event => {
  console.log('Service Worker activating... Version:', APP_VERSION);
  console.log('Cache name:', CACHE_NAME);
  
  event.waitUntil(
    Promise.all([
      // Delete all old caches immediately - aggressive cleanup
      caches.keys().then(cacheNames => {
        console.log('Found caches:', cacheNames);
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            } else {
              console.log('Keeping current cache:', cacheName);
            }
          })
        );
      }).then(() => {
        console.log('Cache cleanup completed');
      }),
      
      // Claim all clients immediately - critical for iOS PWA
      self.clients.claim().then(() => {
        console.log('Service Worker claimed all clients');
        
        // Notify all clients about the update - hanushlasky pattern
        return self.clients.matchAll().then(clients => {
          console.log(`Notifying ${clients.length} clients about update`);
          clients.forEach(client => {
            console.log('Sending SW_UPDATED message to client');
            client.postMessage({
              type: 'SW_UPDATED',
              version: APP_VERSION,
              cacheName: CACHE_NAME,
              timestamp: Date.now()
            });
          });
        });
      }).then(() => {
        console.log('All clients notified successfully');
      })
    ])
  );
});

// Handle messages from main app (hanushlasky-style)
self.addEventListener('message', event => {
  console.log('Service worker received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SKIP_WAITING message received, activating new service worker');
    console.log('Current version:', APP_VERSION);
    
    self.skipWaiting().then(() => {
      console.log('skipWaiting completed');
      // Immediately claim all clients after skipping waiting
      return self.clients.claim();
    }).then(() => {
      console.log('New service worker claimed all clients');
      
      // Notify all clients immediately after claiming
      return self.clients.matchAll();
    }).then(clients => {
      console.log(`Sending immediate update notification to ${clients.length} clients`);
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_UPDATED',
          version: APP_VERSION,
          cacheName: CACHE_NAME,
          source: 'SKIP_WAITING',
          timestamp: Date.now()
        });
      });
    }).catch(error => {
      console.error('Error during SKIP_WAITING process:', error);
    });
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    console.log('GET_VERSION request received');
    const versionInfo = {
      type: 'VERSION_INFO',
      version: APP_VERSION,
      cacheName: CACHE_NAME,
      timestamp: Date.now()
    };
    console.log('Sending version info:', versionInfo);
    event.ports[0].postMessage(versionInfo);
  }
  
  // Additional hanushlasky-style debug commands
  if (event.data && event.data.type === 'GET_CACHE_INFO') {
    caches.keys().then(cacheNames => {
      event.ports[0].postMessage({
        type: 'CACHE_INFO',
        caches: cacheNames,
        currentCache: CACHE_NAME
      });
    });
  }
});