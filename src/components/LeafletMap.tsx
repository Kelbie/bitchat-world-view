import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Simple geohash decoder
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

interface Chatroom {
  geohash: string;
  name: string;
  messageCount: number;
}

interface LeafletMapProps {
  chatrooms: Chatroom[];
  onChatroomClick?: (geohash: string) => void;
  searchTopic?: string;
  topicHotspots?: Array<{
    geohash: string;
    lat: number;
    lng: number;
    mentions: number;
    totalMessages: number;
  }>;
}

// Custom icon for chatrooms
function createChatroomIcon(messageCount: number, isHotspot = false, mentions = 0) {
  const size = Math.max(20, Math.min(40, 20 + messageCount / 5));
  const hotspotSize = isHotspot ? Math.max(25, Math.min(50, 25 + mentions * 2)) : size;
  const finalSize = isHotspot ? hotspotSize : size;
  const color = isHotspot ? '#ef4444' : '#10b981';
  const borderColor = isHotspot ? '#dc2626' : '#059669';

  return L.divIcon({
    className: "custom-chatroom-icon",
    html: `
      <div style="
        width: ${finalSize}px;
        height: ${finalSize}px;
        background: ${color};
        border: 2px solid ${borderColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${Math.max(10, finalSize / 3)}px;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ${isHotspot ? 'animation: pulse 2s infinite;' : ''}
      ">
        ${isHotspot ? mentions : messageCount}
      </div>
    `,
    iconSize: [finalSize, finalSize],
    iconAnchor: [finalSize / 2, finalSize / 2],
  });
}

export default function LeafletMap({
  chatrooms,
  onChatroomClick,
  searchTopic,
  topicHotspots,
}: LeafletMapProps) {
  // Decode geohashes to coordinates
  const mapPoints = useMemo(() => {
    // If we have topic hotspots, use those instead of regular chatrooms
    if (searchTopic && topicHotspots && topicHotspots.length > 0) {
      return topicHotspots.map(hotspot => ({
        geohash: hotspot.geohash,
        name: `#${hotspot.geohash}`,
        messageCount: hotspot.totalMessages,
        lat: hotspot.lat,
        lng: hotspot.lng,
        mentions: hotspot.mentions,
        isHotspot: true,
      }));
    }

    // Regular chatroom display
    return chatrooms
      .map((room) => {
        const coords = decodeGeohash(room.geohash);
        if (!coords) return null;

        return {
          ...room,
          lat: coords.lat,
          lng: coords.lng,
          isHotspot: false,
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null);
  }, [chatrooms, searchTopic, topicHotspots]);

  // Calculate map center based on points
  const mapCenter = useMemo(() => {
    if (mapPoints.length === 0) return [0, 0] as [number, number];

    const totalLat = mapPoints.reduce((sum, point) => sum + point.lat, 0);
    const totalLng = mapPoints.reduce((sum, point) => sum + point.lng, 0);

    return [totalLat / mapPoints.length, totalLng / mapPoints.length] as [
      number,
      number
    ];
  }, [mapPoints]);

  return (
    <div className="bg-gray-900 rounded-lg p-2 sm:p-4">
      <h3 className="text-lg font-bold text-green-300 mb-4">
        Chatroom Locations
      </h3>

      <div
        className="bg-gray-800 rounded-lg overflow-hidden"
        style={{ height: "70dvh", minHeight: "400px" }}
      >
        {mapPoints.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-2xl mb-2">🌍</div>
              <div>
                {searchTopic 
                  ? `No locations discussing "${searchTopic}" found`
                  : 'No chatrooms found yet'
                }
              </div>
              <div className="text-sm">
                {searchTopic 
                  ? 'Try a different search term or wait for more messages'
                  : 'Waiting for kind 20000 events with geohash tags...'
                }
              </div>
            </div>
          </div>
        ) : (
          <MapContainer
            center={mapCenter}
            zoom={2}
            style={{ height: "70dvh", width: "100%" }}
            className="leaflet-container"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {mapPoints.map((point) => (
              <Marker
                key={point.geohash}
                position={[point.lat, point.lng]}
                icon={createChatroomIcon(
                  point.messageCount, 
                  point.isHotspot, 
                  point.mentions
                )}
                eventHandlers={{
                  click: () => onChatroomClick?.(point.geohash),
                }}
              >
                <Popup>
                  <div className="text-center">
                    <div className="font-bold text-green-600">
                      #{point.geohash}
                    </div>
                    {point.isHotspot && searchTopic && (
                      <div className="text-sm text-red-400 font-semibold">
                        "{searchTopic}": {point.mentions} mentions
                      </div>
                    )}
                    <div className="text-sm text-gray-600">
                      {point.messageCount} messages
                    </div>
                    <button
                      onClick={() => onChatroomClick?.(point.geohash)}
                      className="mt-2 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                    >
                      View Chatroom
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-400">
        {searchTopic ? (
          <>
            <p>• <span className="text-red-400">Red circles</span> show hotspots for "{searchTopic}"</p>
            <p>• Circle size indicates mention frequency</p>
            <p>• Numbers show mention count</p>
          </>
        ) : (
          <>
            <p>• Green circles represent chatrooms</p>
            <p>• Circle size indicates message activity</p>
            <p>• Numbers show message count</p>
          </>
        )}
        <p>• Click circles to filter by location</p>
      </div>
    </div>
  );
}
