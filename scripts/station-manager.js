// scripts/station-manager.js

const FAVORITES_KEY = 'radioMax_favorites';

// ================================================================
// Gestión de favoritos
// ================================================================

export function getFavorites() {
  try {
    const favorites = localStorage.getItem(FAVORITES_KEY);
    return favorites ? JSON.parse(favorites) : [];
  } catch (error) {
    console.error("Error al leer favoritos de localStorage:", error);
    return [];
  }
}

export function saveFavorites(favoritesList) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoritesList));
  } catch (error) {
    console.error("Error al guardar favoritos en localStorage:", error);
  }
}

export function addFavorite(stationId) {
  let favorites = getFavorites();
  if (!favorites.includes(stationId)) {
    favorites.push(stationId);
    saveFavorites(favorites);
    return true;
  }
  return false;
}

export function removeFavorite(stationId) {
  let favorites = getFavorites();
  const initialLength = favorites.length;
  favorites = favorites.filter(id => id !== stationId);
  if (favorites.length !== initialLength) {
    saveFavorites(favorites);
    return true;
  }
  return false;
}

export function isFavorite(stationId) {
  return getFavorites().includes(stationId);
}

// ================================================================
// Carga y procesamiento de estaciones desde stations.json
// ================================================================

/**
 * Carga las estaciones desde el archivo stations.json y las agrupa por servicio.
 * @returns {Promise<{ [serviceName: string]: Array<Station> }>} Objeto agrupado por servicio
 */
export async function loadStations() {
  try {
    const response = await fetch('stations.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const allStations = await response.json();

    // Agrupar por servicio
    const groupedStations = allStations.reduce((acc, station) => {
      const serviceName = station.service === 'somafm'
        ? 'SomaFM'
        : station.service === 'radioparadise'
          ? 'Radio Paradise'
          : station.service === 'nrk'
            ? 'NRK Radio'
            : 'Otro';
      if (!acc[serviceName]) acc[serviceName] = [];
      acc[serviceName].push(station);
      return acc;
    }, {});

    // Ordenar alfabéticamente dentro de cada grupo
    for (const serviceName in groupedStations) {
      groupedStations[serviceName].sort((a, b) => a.name.localeCompare(b.name));
    }

    return groupedStations;
  } catch (error) {
    console.error('Error al cargar las estaciones:', error);
    throw error;
  }
}

// ================================================================
// Gestión de la última estación seleccionada
// ================================================================

export function getLastSelectedStationId() {
  return localStorage.getItem('lastSelectedStation');
}

export function saveLastSelectedStation(stationId) {
  localStorage.setItem('lastSelectedStation', stationId);
}

// ================================================================
// Utilidad: convertir objeto agrupado a lista plana (útil para UI o búsqueda)
// ================================================================

export function flattenStations(groupedStations) {
  return Object.values(groupedStations).flat();
}

// ================================================================
// Utilidad: obtener una estación por ID desde el objeto agrupado
// ================================================================

export function findStationById(groupedStations, stationId) {
  const allStations = flattenStations(groupedStations);
  return allStations.find(station => station.id === stationId) || null;
}
