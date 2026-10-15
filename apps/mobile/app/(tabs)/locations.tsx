import { LocationDto } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Body, Button, Card, Choice, H2, Loader, Muted, Row, s } from '@/components/ui';
import { ScrollView } from 'react-native';
import { api } from '@/lib/api';
import { c, r } from '@/theme';

const WEEKDAYS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function Locations() {
  const [q, setQ] = useState('');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const list = useQuery({
    queryKey: ['locations', q, me],
    queryFn: () => api.get<LocationDto[]>('/locations', { query: { q: q || undefined, lat: me?.lat, lng: me?.lng } }),
  });
  const locations = useMemo(() => list.data ?? [], [list.data]);
  const current = locations.find((l) => l.id === selected);

  async function locate() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    map.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 });
  }

  function select(l: LocationDto) {
    setSelected(l.id);
    map.current?.animateToRegion({ latitude: l.latitude, longitude: l.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ink }} edges={['top']}>
      <View style={{ padding: 16, gap: 10 }}>
        <Row>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Barrio, ciudad o código postal" placeholderTextColor={c.fog} value={q} onChangeText={setQ} accessibilityLabel="Buscar ubicaciones" />
          <Button title="Cerca de mí" size="sm" onPress={locate} />
        </Row>
      </View>
      <MapView
        ref={map}
        provider={PROVIDER_DEFAULT}
        style={st.map}
        userInterfaceStyle="dark"
        showsUserLocation={!!me}
        initialRegion={{ latitude: 41.3874, longitude: 2.1686, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
      >
        {locations.map((l) => (
          <Marker key={l.id} coordinate={{ latitude: l.latitude, longitude: l.longitude }} title={l.name} pinColor={l.id === selected ? c.mint : c.sky} onPress={() => select(l)} />
        ))}
      </MapView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {list.isLoading ? <Loader /> : null}
        {current ? (
          <Card big>
            <Row style={{ justifyContent: 'space-between' }}>
              <H2>{current.name}</H2>
              <Badge label={current.openNow ? 'Abierto ahora' : 'Cerrado ahora'} tone={current.openNow ? 'ok' : 'none'} />
            </Row>
            <Muted>
              {current.address}, {current.city}
            </Muted>
            <View style={{ gap: 2, marginTop: 8 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const h = current.openingHours.filter((o) => o.weekday === d);
                return (
                  <Row key={d} style={{ gap: 16 }}>
                    <Body style={{ width: 40 }}>{WEEKDAYS[d]}</Body>
                    <Muted>{h.length ? h.map((o) => `${o.opensAt}–${o.closesAt}`).join(', ') : 'Cerrado'}</Muted>
                  </Row>
                );
              })}
            </View>
            <Button title="Reservar aquí" variant="primary" onPress={() => router.push({ pathname: '/book', params: { location: current.id } })} />
            <Button
              title="Cómo llegar"
              onPress={() =>
                Linking.openURL(
                  Platform.OS === 'ios'
                    ? `maps:?daddr=${current.latitude},${current.longitude}`
                    : `geo:${current.latitude},${current.longitude}?q=${encodeURIComponent(current.name)}`,
                )
              }
            />
            <Button title="Ver todas" variant="ghost" onPress={() => setSelected(null)} />
          </Card>
        ) : (
          locations.map((l) => (
            <Choice
              key={l.id}
              title={l.name}
              subtitle={`${l.address}${l.distanceKm != null ? ` · ${l.distanceKm} km` : ''}`}
              onPress={() => select(l)}
              right={<Badge label={l.openNow ? 'Abierto' : 'Cerrado'} tone={l.openNow ? 'ok' : 'none'} />}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({ map: { height: 260, marginHorizontal: 16, borderRadius: r.lg, overflow: 'hidden' } });
