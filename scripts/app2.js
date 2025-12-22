    // NUEVO: Event listener para el botón de filtro de favoritos
    filterToggleStar.addEventListener('click', function() {
        showOnlyFavorites = !showOnlyFavorites;
        this.classList.toggle('active');
        
        if (showOnlyFavorites) {
            this.innerHTML = '★'; // Estrella rellena
            this.title = 'Mostrar todas'; // AÑADE ESTA LÍNEA
            this.setAttribute('aria-label', 'Mostrar todas las estaciones'); // AÑADE ESTA LÍNEA
            filterStationsByFavorites();
        } else {
            this.innerHTML = '☆'; // Estrella vacía
            this.title = 'Mostrar solo favoritas'; // AÑADE ESTA LÍNEA
            this.setAttribute('aria-label', 'Mostrar solo las estaciones favoritas'); // AÑADE ESTA LÍNEA
            showAllStations();
        }
    });
