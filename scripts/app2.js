// NUEVO: Event listener para el botón de filtro de favoritos
filterToggleStar.addEventListener('click', function() {
    showOnlyFavorites = !showOnlyFavorites;
    this.classList.toggle('active');
    
    if (showOnlyFavorites) {
        this.innerHTML = '★'; // Estrella rellena
        filterStationsByFavorites();
    } else {
        this.innerHTML = '☆'; // Estrella vacía
        showAllStations();
    }
});
