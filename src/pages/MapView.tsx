import { useState, useMemo } from 'react';
import LeafletMap from '../components/LeafletMap';
import { getTagValue } from '../lib/applesauce';

interface Chatroom {
  geohash: string;
  name: string;
  messageCount: number;
}

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
}

interface MapViewProps {
  chatrooms: Chatroom[];
  onChatroomSelect: (geohash: string) => void;
  onBackToChat: () => void;
  events?: NostrEvent[];
}

// Simple geohash decoder (duplicate from LeafletMap for now)
function decodeGeohash(geohash: string): { lat: number; lng: number } | null {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let lat = 0;
  let lng = 0;
  let latErr = 90;
  let lngErr = 180;
  let isEven = true;

  for (let i = 0; i < geohash.length; i++) {
    const c = geohash[i];
    const cd = base32.indexOf(c);
    if (cd === -1) return null;

    for (let j = 4; j >= 0; j--) {
      const mask = 1 << j;
      if (isEven) {
        lngErr /= 2;
        if (cd & mask) {
          lng += lngErr;
        } else {
          lng -= lngErr;
        }
      } else {
        latErr /= 2;
        if (cd & mask) {
          lat += latErr;
        } else {
          lat -= latErr;
        }
      }
      isEven = !isEven;
    }
  }

  return { lat, lng };
}

export default function MapView({ 
  chatrooms, 
  onChatroomSelect, 
  onBackToChat, 
  events = [] 
}: MapViewProps) {
  const [searchTopic, setSearchTopic] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // Get all mentions for the active search
  const allMentions = useMemo(() => {
    if (!activeSearch || !events.length) return [];

    const searchLower = activeSearch.toLowerCase();
    const mentions: Array<{
      event: NostrEvent;
      geohash: string;
      mentionCount: number;
      timestamp: number;
    }> = [];

    events.forEach(event => {
      const geohash = getTagValue(event, "g");
      const content = event.content?.toLowerCase() || '';
      
      if (geohash && content.includes(searchLower)) {
        const mentionCount = (content.match(new RegExp(searchLower, 'g')) || []).length;
        mentions.push({
          event,
          geohash,
          mentionCount,
          timestamp: event.created_at
        });
      }
    });

    // Sort by timestamp (newest first)
    return mentions.sort((a, b) => b.timestamp - a.timestamp);
  }, [activeSearch, events]);

  // Calculate topic hotspots based on search
  const topicHotspots = useMemo(() => {
    if (!activeSearch || !events.length) return [];

    const searchLower = activeSearch.toLowerCase();
    const locationMentions = new Map<string, { mentions: number; totalMessages: number }>();

    // Count mentions by geohash
    events.forEach(event => {
      const geohash = getTagValue(event, "g");
      const content = event.content?.toLowerCase() || '';
      
      if (geohash && content.includes(searchLower)) {
        const current = locationMentions.get(geohash) || { mentions: 0, totalMessages: 0 };
        
        // Count how many times the topic appears in this message
        const mentions = (content.match(new RegExp(searchLower, 'g')) || []).length;
        
        locationMentions.set(geohash, {
          mentions: current.mentions + mentions,
          totalMessages: current.totalMessages + 1
        });
      }
    });

    // Convert to hotspot format with coordinates
    return Array.from(locationMentions.entries())
      .map(([geohash, data]) => {
        const coords = decodeGeohash(geohash);
        if (!coords) return null;

        return {
          geohash,
          lat: coords.lat,
          lng: coords.lng,
          mentions: data.mentions,
          totalMessages: data.totalMessages,
        };
      })
      .filter((hotspot): hotspot is NonNullable<typeof hotspot> => hotspot !== null)
      .sort((a, b) => b.mentions - a.mentions); // Sort by mention count
  }, [activeSearch, events]);

  const handleSearch = () => {
    setActiveSearch(searchTopic.trim());
  };

  const handleClearSearch = () => {
    setSearchTopic('');
    setActiveSearch('');
  };

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <header className="sticky top-0 z-10 bg-black/90 border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={onBackToChat}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 sm:px-4 py-2 rounded transition-colors text-sm sm:text-base"
            >
              ← Back
            </button>
            <h1 className="text-lg sm:text-xl font-bold text-green-300">
              {activeSearch ? `"${activeSearch}" Hotspots` : 'World Map View'}
            </h1>
          </div>
          <div className="text-gray-400 text-sm sm:text-base">
            {activeSearch 
              ? `${topicHotspots.length} hotspots found`
              : `${chatrooms.length} active chatrooms`
            }
          </div>
        </div>
      </header>

      <main className="p-2 sm:p-6">
        {/* Search Section */}
        <div className="mb-6 bg-gray-900 rounded-lg p-4">
          <h2 className="text-lg font-bold text-green-300 mb-3">Topic Search</h2>
          <p className="text-gray-300 text-sm mb-4">
            Search for topics to see where they're being discussed most. Enter any word or phrase to find geographic hotspots.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={searchTopic}
                onChange={(e) => setSearchTopic(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter topic (e.g., bitcoin, nostr, coffee...)"
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-100 placeholder-gray-400 focus:border-green-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                disabled={!searchTopic.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-colors"
              >
                Search
              </button>
              {activeSearch && (
                <button
                  onClick={handleClearSearch}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          {activeSearch && (
            <div className="mt-3 text-sm">
              <span className="text-gray-400">Searching for: </span>
              <span className="text-green-300 font-semibold">"{activeSearch}"</span>
              <span className="text-gray-400 ml-2">
                ({topicHotspots.reduce((sum, h) => sum + h.mentions, 0)} total mentions found)
              </span>
              
              {/* Mentions List */}
              {allMentions.length > 0 && (
                <div className="mt-4 bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <h4 className="text-green-300 font-semibold mb-3">
                    All Mentions ({allMentions.length} messages):
                  </h4>
                  <div className="space-y-2">
                    {allMentions.map((mention, index) => {
                      const nickname = getTagValue(mention.event, "n") || `${mention.event.pubkey?.slice(0, 8)}…`;
                      const time = new Date(mention.timestamp * 1000).toLocaleTimeString([], { 
                        hour: "2-digit", 
                        minute: "2-digit" 
                      });
                      
                      // Highlight the search term in the content
                      const highlightedContent = mention.event.content.replace(
                        new RegExp(`(${activeSearch})`, 'gi'),
                        '<mark class="bg-yellow-400 text-black px-1 rounded">$1</mark>'
                      );
                      
                      return (
                        <div key={`${mention.event.id}-${index}`} className="text-xs border-l-2 border-green-500 pl-3 py-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-400">[{time}]</span>
                            <span className="text-cyan-300">&lt;{nickname}&gt;</span>
                            <span className="text-fuchsia-300">#{mention.geohash}</span>
                            {mention.mentionCount > 1 && (
                              <span className="text-yellow-400 text-xs">
                                ({mention.mentionCount}x)
                              </span>
                            )}
                            <button
                              onClick={() => onChatroomSelect(mention.geohash)}
                              className="text-blue-400 hover:text-blue-300 text-xs underline ml-auto"
                            >
                              View Location
                            </button>
                          </div>
                          <div 
                            className="text-gray-200 break-words"
                            dangerouslySetInnerHTML={{ __html: highlightedContent }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-6">
          <p className="text-gray-300 mb-4">
            {activeSearch 
              ? `Red circles show locations where "${activeSearch}" is being discussed. Larger circles indicate more mentions.`
              : 'Explore chatrooms by geographic location. Each circle represents a chatroom where kind 20000 events have been posted.'
            }
            Click on any location to filter the chat by that area.
          </p>
        </div>

        <LeafletMap
          chatrooms={chatrooms}
          onChatroomClick={onChatroomSelect}
          searchTopic={activeSearch}
          topicHotspots={topicHotspots}
        />

        <div className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {activeSearch && (
            <div className="bg-gray-900 rounded-lg p-3 sm:p-4">
              <h3 className="text-base sm:text-lg font-bold text-red-400 mb-2">Topic Hotspots</h3>
              <p className="text-gray-300 text-xs sm:text-sm">
                Red pulsing circles show where "{activeSearch}" is being discussed most frequently. 
                The size indicates the number of mentions in that location.
              </p>
            </div>
          )}
          
          <div className="bg-gray-900 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-300 mb-2">About Geohashes</h3>
            <p className="text-gray-300 text-xs sm:text-sm">
              Geohashes encode geographic coordinates into short strings. Each character adds precision to the location.
              {activeSearch 
                ? 'Topic analysis is performed on all messages within each geohash region.'
                : 'Chatrooms are created based on the geohash precision in kind 20000 events.'
              }
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-300 mb-2">Map Legend</h3>
            <div className="text-xs sm:text-sm text-gray-300 space-y-1">
              {activeSearch ? (
                <>
                  <p>• <span className="text-red-400">Red circles</span> = Topic hotspots</p>
                  <p>• <span className="text-red-400">Pulsing effect</span> = Active discussion</p>
                  <p>• <span className="text-red-400">Numbers</span> = Mention count</p>
                </>
              ) : (
                <>
                  <p>• <span className="text-green-400">Green circles</span> = Active chatrooms</p>
                  <p>• <span className="text-green-400">Larger circles</span> = More messages</p>
                  <p>• <span className="text-green-400">Numbers</span> = Message count</p>
                </>
              )}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-bold text-green-300 mb-2">Navigation</h3>
            <p className="text-gray-300 text-xs sm:text-sm">
              {activeSearch 
                ? 'Click any hotspot to view messages from that location. Use "Clear" to return to normal chatroom view.'
                : 'Click any chatroom on the map to filter messages by that location. Use the "Back to Chat" button to return to the main chat interface.'
              }
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
