import { fmstyles } from "@/assets/styles/friendModalStyles";
import FriendItem, { formatLastSeen } from "@/components/friendItem";
import GlobalSearch from "@/components/globalSearch";
import RoomItem from "@/components/hRoomItem";
import MapBottomSheet, { BottomSheetMethods } from "@/components/mapBottomSheet";
import FriendModalSheet, { FriendModalSheetRef } from '@/components/sheets/friendModalSheet';
import RoomModalSheet, { RoomModalSheetMethods } from "@/components/sheets/roomModalSheet";
import { Room, useRoomStore } from '@/lib/roomService';
import { MaterialIcons } from "@expo/vector-icons";
import { BottomSheetFlatList, BottomSheetModalProvider, BottomSheetView } from "@gorhom/bottom-sheet";
import {
  Camera,
  CustomLocationProvider,
  FillLayer,
  MapView,
  OnPressEvent,
  RasterLayer,
  setAccessToken,
  ShapeSource,
  UserLocation
} from '@rnmapbox/maps';
import { router } from "expo-router";
import { StatusBar } from 'expo-status-bar';
import { MultiPolygon, Polygon } from 'geojson';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlatList, GestureHandlerRootView } from "react-native-gesture-handler";

// Define the shape of our room feature properties
type RoomFeatureProperties = {
  id: string;
  roomNumber: string;
  title: string;
  isSelected: boolean;
  color: string;
  rgba: string;
};

type RoomFeature = MapboxFeature & {
  id: string;
  properties: RoomFeatureProperties;
};

type myFeature = {
  id?: string;
  properties?: {
    id?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

type CustomMapPressEvent = MapPressEvent & {
  features?: myFeature[];
};

type RoomItemData = {
  id: string;
  name: string;
  floor: string;
  capacity: number;
  isAvailable: boolean;
  isFavorite: boolean;
  room_number: string;
};

type RoomWithEquipment = {
  id: string;
  room_number: string;
  title: string;
  seats: number;
  status: string;
  equipment?: {
    floor?: string;
  };
};

const emptyGeoJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: []
};



export default function HomeScreen() {
  const styleUrlKey = process.env.EXPO_PUBLIC_MAPTILER_KEY as string

  setAccessToken("sk.eyJ1Ijoib25yZWMiLCJhIjoiY21jYmJ3ZTQwMGNzNjJvcG9yNW9zY3MzMyJ9.KUC568EU0LR_Cq1XkEWtQ")

  const [geoData, setGeoData] = useState(null);
  const friendModalRef = useRef<FriendModalSheetRef>(null);
  const mapBottomSheetRef = useRef<BottomSheetMethods>(null);
  const roomModalRef = useRef<RoomModalSheetMethods>(null); 
  const [friends, setFriends] = useState([
    { 
      name: 'Faru Yusupov', 
      id: '1', 
      status: 'at school' as const, 
      lastSeen: new Date().toISOString(), // Now (will show as 'Just now' if within 30s)
      location: [24.81851, 60.18394] as [number, number],
    }, 
    { 
      name: 'Toivo Kallio',
      id: '2', 
      status: 'at school' as const, 
      lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      location: [24.81856, 60.18399] as [number, number],
    }, 
    { 
      name: 'Wilmer von Harpe', 
      id: '3', 
      status: 'at school' as const, 
      lastSeen: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
      location: [24.81847, 60.18389] as [number, number],
    }, 
    { 
      name: 'Maximilian Bergström', 
      id: '4', 
      status: 'at school' as const, 
      lastSeen: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), 
      location: [24.81844, 60.18384] as [number, number],
    }
  ]);
  const [selectedTab, setSelectedTab] = useState('people'); 
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const { rooms, loading, error, fetchRooms } = useRoomStore();
  const [roomData, setRoomData] = useState<Array<RoomItemData & { id: string; isFavorite: boolean }>>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const fetchRoomsRef = useRef(fetchRooms);
  const [friendId, setFriendId] = useState('');
  
  const handleTabPress = (tab: string) => {
    if (selectedTab === tab) {
      setShowFavoritesOnly(!showFavoritesOnly);
    } else {
      setSelectedTab(tab);
      setShowFavoritesOnly(false);
    }
  };

  useEffect(() => {
    fetchRoomsRef.current = fetchRooms;
  }, [fetchRooms]);

  useEffect(() => {
    fetchRoomsRef.current();
  }, []);

  useEffect(() => {
    if (rooms.length > 0) {
      setRoomData(rooms);
    } else {
      setRoomData([]);
    }
  }, [rooms]);

  const handleAddFriend = () => {
    console.log('[HomeScreen] modal ref is', friendModalRef.current);
    friendModalRef.current?.present();
  };

  const handleDismiss = () => {
    console.log('[HomeScreen] Dismissing modal');
    friendModalRef.current?.dismiss();
  };

  // On mount: try loading from cache
  useEffect(() => {
    (async () => {
      const cached = await getCachedGeoJSON();
      if (cached) setGeoData(cached);
    })();
  }, []);

  const handleRoomPress = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
    mapBottomSheetRef.current?.snapToMin();
    roomModalRef.current?.open(roomId);
    
    // Center the map on the selected room
    const room = rooms.find(r => r.id === roomId);
    if (room?.geometry) {
      // Calculate centroid of the polygon
      const coordinates = room.geometry.coordinates[0];
      type Coordinate = [number, number];
      
      // Safely calculate the centroid of the polygon
      let sumLng = 0;
      let sumLat = 0;
      let validPoints = 0;
      
      for (const coord of coordinates) {
        if (Array.isArray(coord) && coord.length >= 2) {
          const [lng, lat] = coord;
          if (typeof lng === 'number' && typeof lat === 'number') {
            sumLng += lng;
            sumLat += lat;
            validPoints++;
          }
        }
      }
      
      const centroid: Coordinate = validPoints > 0 
        ? [sumLng / validPoints, sumLat / validPoints]
        : [0, 0]; // Fallback to [0,0] if no valid points

      // Animate camera to the centroid
      mapRef.current?.setCamera({
        centerCoordinate: [centroid[0], centroid[1]],
        zoomLevel: 18,
        animationDuration: 1000,
      });
    }
  }, [rooms]);

  const handleFriendOpen = (friendId: string) => {
    setFriendId(friendId);
    friendModalRef.current?.present();
    mapBottomSheetRef.current?.snapToMin();
  };

  const handlePress = (e: { point: { x: number; y: number } }) => {
    console.log('Map pressed', e.point);
  };

  // Create a ref for the map
  const mapRef = useRef<MapView>(null);
  
  // Define a type for our room with geometry
  type RoomWithGeometry = Room & { 
    geometry: Polygon | MultiPolygon;
    color?: string; // Add color property to room type
  };

  // Room properties type for GeoJSON features
  type RoomProperties = {
    id: string;
    roomNumber: string;
    title: string;
    isSelected: boolean;
    color: string;
    rgba: string;
  };

  // Helper function to ensure valid hex color
  const getValidColor = (color?: string): string => {
    if (!color) return '#4A89EE';
    // Check if it's a valid hex color
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      return color;
    }
    return '#4A89EE'; // Default color if invalid
  };

  // Create GeoJSON features from rooms with geometry
  const roomsWithGeometry = useMemo(() => 
    rooms.filter((room): room is RoomWithGeometry => Boolean(room?.geometry)),
    [rooms]
  );

  const roomsGeoJSON = useMemo(() => {
    const features = roomsWithGeometry.map(room => {
      const roomColor = getValidColor(room.color);
      const [r, g, b] = [
        parseInt(roomColor.slice(1, 3), 16),
        parseInt(roomColor.slice(3, 5), 16),
        parseInt(roomColor.slice(5, 7), 16)
      ];
      
      return {
        type: 'Feature',
        geometry: room.geometry,
        properties: {
          id: room.id,
          roomNumber: room.room_number,
          title: room.title || 'Untitled Room',
          isSelected: selectedRoomId === room.id,
          color: roomColor,
          // Pre-calculate RGBA values for unselected state
          rgba: `rgba(${r}, ${g}, ${b}, 0.5)`
        }
      };
    });

    return {
      type: 'FeatureCollection',
      features
    } as any; // Type assertion to fix the TypeScript error with rnmapbox/maps
  }, [roomsWithGeometry, selectedRoomId]);

  // Handle room press on the map
  const handleRoomFeaturePress = useCallback((e: OnPressEvent) => {
    const feature = e.features?.[0];
    if (feature) {
      const roomId = (feature.properties as RoomFeatureProperties)?.id;
      if (roomId) {
        handleRoomPress(roomId);
      }
    }
  }, [handleRoomPress]);

  return (
    <GestureHandlerRootView style={styles.container}>
    <BottomSheetModalProvider>
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={`https://api.maptiler.com/maps/openstreetmap/style.json?key=XSJRg4GXeLgDiZ98hfVp`}
        compassViewMargins={{ x: 10, y: 40 }}
        pitchEnabled={true}
        scaleBarEnabled={false}
      >
        <Camera
          centerCoordinate={[24.818510511790645, 60.18394233125424]}
          zoomLevel={16}
          animationDuration={1000}
          pitch={5}
          maxBounds={{
            ne: [24.620221246474574, 59.98446920858392],
            sw: [25.016749575387433, 60.28339638856884]
          }}
          minZoomLevel={9}
        />
        {/* Room Geometries */}
        {roomsGeoJSON.features.length > 0 && (
          <ShapeSource 
            id="roomsSource" 
            shape={roomsGeoJSON}
            onPress={handleRoomFeaturePress}
          >
            <FillLayer
              id="room-fill"
              style={{
                fillColor: [
                  'case',
                  ['==', ['get', 'isSelected'], true],
                  ['get', 'color'], 
                  ['get', 'rgba']   
                ],
                fillOpacity: 0.8,
                fillOutlineColor: '#fff',
              }}
            />
          </ShapeSource>
        )}

        <CustomLocationProvider
          coordinate={[24.18510511790645, 60.18394233125424]}
          heading={0}
        />
        <UserLocation/>
      
        <RasterLayer
          id="buildingImageLayer"
          sourceID="buildingImage"
          style={{
            rasterOpacity: 0,
          }}
        />

        {/*<ShapeSource
          id="friendsSource"
          shape={{
            type: 'FeatureCollection',
            features: friends.map(friend => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: friend.location,
              },
              properties: {
                id: String(friend.id),
              },
            })),
          }}
        >
          {friends.map(friend => (
            <PointAnnotation
              key={String(friend.id)}
              id={String(friend.id)}
              coordinate={friend.location}
              onSelected={() => handleFriendOpen(friend.id)}
            >
              <FriendBlob
                friendId={String(friend.id)}
                name={friend.name}
                onClick={handleFriendOpen}
              />
            </PointAnnotation>
          ))}
        </ShapeSource>*/}

      </MapView>

      <GlobalSearch roomModalRef={roomModalRef} />

      <RoomModalSheet
        ref={roomModalRef}
        onDismiss={() => {
          setSelectedRoomId(null);
        }}
      />

      <FriendModalSheet
        ref={friendModalRef}
        onDismiss={() => { 
          // Any cleanup when modal is dismissed
        }}
        initialSnap="mid"
      >
        <View style={fmstyles.headerContainer}>
          <View style={fmstyles.headerLeft}>
            <Text style={fmstyles.name}>{friends.find(f => f.id === friendId)?.name}</Text>
            <Text style={fmstyles.status}>{friends.find(f => f.id === friendId)?.status.charAt(0).toUpperCase() + friends.find(f => f.id === friendId)?.status.slice(1)} • {formatLastSeen(friends.find(f => f.id === friendId)?.lastSeen)}</Text>
          </View>
          <Pressable onPress={() => friendModalRef.current?.close()}>
            <MaterialIcons name="close" size={24} color="#666" />
          </Pressable>
        </View>
        <View style={fmstyles.navigateButton}>
          <Text style={fmstyles.navigateButtonText}>Reittiohjeet</Text>
          <MaterialIcons name="directions" size={24} color="white" />
        </View>

        <Pressable style={fmstyles.button}>
          <MaterialIcons name="edit" size={20} color="black" />
          <Text style={fmstyles.buttonText}>Muokkaa nimeä</Text>
        </Pressable>

        <View style={{ height: 8 }}/>

        <Pressable style={fmstyles.redButton}>
          <Text style={fmstyles.redButtonText}>Lopeta oman sijainnin jako</Text>
        </Pressable>
        <Pressable style={fmstyles.redButton}>
          <Text style={fmstyles.redButtonText}>Estä {friends.find(f => f.id === friendId)?.name}</Text>
        </Pressable>
        <Pressable style={fmstyles.redButton}>
          <Text style={fmstyles.redButtonText}>Ilmianna {friends.find(f => f.id === friendId)?.name}</Text>
        </Pressable>
      </FriendModalSheet>
      
      <MapBottomSheet
        ref={mapBottomSheetRef}
        initialSnap="mid"
      >
        {({ currentSnapIndex }) => (
        <BottomSheetView style={{ flex: 1, backgroundColor: 'white', height: '100%' }}>
          {selectedTab === 'people' && (
            <BottomSheetFlatList 
              data={[
                { 
                  name: 'Faru Yusupov', 
                  id: '1', 
                  status: 'at school' as const, 
                  lastSeen: new Date().toISOString() // Now (will show as 'Just now' if within 30s)
                }, 
                { 
                  name: 'Toivo Kallio',
                  id: '2', 
                  status: 'at school' as const, 
                  lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
                }, 
                { 
                  name: 'Wilmer von Harpe', 
                  id: '3', 
                  status: 'at school' as const, 
                  lastSeen: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
                }, 
                { 
                  name: 'Maximilian Bergström', 
                  id: '4', 
                  status: 'at school' as const, 
                  lastSeen: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() 
                }
              ]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <FriendItem 
                  friend={item} 
                  onPress={() => handleFriendOpen(item.id)}
                />
              )}
              scrollEnabled={currentSnapIndex === 2}
              contentContainerStyle={{ 
                paddingBottom: 20, 
                flex: currentSnapIndex === 2 ? 1 : 0,
                height: currentSnapIndex === 2 ? '100%' : 'auto'
              }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text>No {showFavoritesOnly ? 'favorite ' : ''}people found</Text>
                </View>
              }
              ListFooterComponent={
                <Pressable 
                  style={({ pressed }) => [
                    styles.addFriendButton,
                    pressed && styles.addFriendButtonPressed
                  ]}
                  onPress={() => {
                    // Handle add friend action
                    console.log('Add friend pressed');
                    router.push('/friends/add');
                  }}
                >
                  <MaterialIcons name="person-add" size={20} color="#4A89EE" />
                  <Text style={styles.addFriendText}>Add Friend</Text>
                </Pressable>
              }
            /> 
          )}
          {selectedTab === 'rooms' && !showFavoritesOnly && (
            <FlatList 
              data={roomData}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const roomWithFavorite = {
                  ...item,
                  isFavorite: item.isFavorite || false,
                  onFavoritePress: () => {
                    setRoomData(prev => 
                      prev.map(room => 
                        room.id === item.id 
                          ? { ...room, isFavorite: !room.isFavorite } 
                          : room
                      )
                    );
                  }
                };
                return (
                  <RoomItem 
                    room={roomWithFavorite}
                    onPress={() => handleRoomPress(item.id)}
                  />
                );
              }}
              scrollEnabled={currentSnapIndex === 2}
              contentContainerStyle={{ 
                paddingTop: 8, 
                paddingBottom: 20,
                flex: currentSnapIndex === 2 ? 1 : 0,
                height: currentSnapIndex === 2 ? '100%' : 'auto'
              }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text>No rooms available</Text>
                </View>
              }
            />
          )}
          {selectedTab === 'rooms' && showFavoritesOnly && (
            loading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4A89EE" />
              </View>
            ) : error ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: 'red', textAlign: 'center' }}>Error loading rooms: {error}</Text>
                <Pressable 
                  onPress={() => fetchRoomsRef.current(true)}
                  style={{ marginTop: 10, padding: 10, backgroundColor: '#4A89EE', borderRadius: 5 }}
                >
                  <Text style={{ color: 'white' }}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={roomData.filter(room => room.isFavorite)}
                scrollEnabled={currentSnapIndex === 2}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <RoomItem
                    room={item}
                    onPress={() => console.log('Selected room:', item.id)}
                  />
                )}
                contentContainerStyle={{ 
                  paddingTop: 8, 
                  paddingBottom: 20,
                  flex: currentSnapIndex === 2 ? 1 : 0,
                  height: currentSnapIndex === 2 ? '100%' : 'auto'
                }}
                ListEmptyComponent={
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text>No rooms available</Text>
                  </View>
                }
              />
            )
          )}
        </BottomSheetView>
        )}
      </MapBottomSheet>
    </View>
    </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  addFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F5FF',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    borderStyle: 'dashed',
  },
  addFriendButtonPressed: {
    opacity: 0.7,
  },
  addFriendText: {
    color: '#4A89EE',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    backgroundColor: '#007AFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  fabText: {
    color: 'white',
    fontSize: 24,
    lineHeight: 28,
  },
  // Modal content styles
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  bottomSheetContainer: {
    flex: 1,
    backgroundColor: 'white',
    zIndex: 1000,
  },
  bottomSheetContent: {
    flex: 1,
    padding: 24,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  bottomSheetButton: {
    backgroundColor: '#4A89EE',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  bottomSheetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
