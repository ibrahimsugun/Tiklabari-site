// Dropdown toggle functionality
document.addEventListener('DOMContentLoaded', function () {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        const navLink = item.querySelector('.nav-link');
        const dropdown = item.querySelector('.dropdown-content');

        if (navLink && dropdown) {
            navLink.addEventListener('click', function (e) {
                e.preventDefault();

                // Diğer açık dropdownları kapat
                navItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('active');
                    }
                });

                // Bu dropdown'u toggle et
                item.classList.toggle('active');
            });
        }
    });

    // Dropdown dışına tıklanınca kapat
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.nav-item')) {
            navItems.forEach(item => {
                item.classList.remove('active');
            });
        }
    });
});
