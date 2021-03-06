/**
 * Image viewer component
 * @module components/slideshow/slideshow
 */
define(['dialogHelper', 'inputManager', 'connectionManager', 'layoutManager', 'focusManager', 'browser', 'apphost', 'css!./style', 'material-icons', 'paper-icon-button-light'], function (dialogHelper, inputManager, connectionManager, layoutManager, focusManager, browser, appHost) {
    'use strict';

    /**
     * Retrieves an item's image URL from the API.
     * @param {object|string} item - Item used to generate the image URL.
     * @param {object} options - Options of the image.
     * @param {object} apiClient - API client instance used to retrieve the image.
     * @returns {null|string} URL of the item's image.
     */
    function getImageUrl(item, options, apiClient) {
        options = options || {};
        options.type = options.type || 'Primary';

        if (typeof (item) === 'string') {
            return apiClient.getScaledImageUrl(item, options);
        }

        if (item.ImageTags && item.ImageTags[options.type]) {
            options.tag = item.ImageTags[options.type];
            return apiClient.getScaledImageUrl(item.Id, options);
        }

        if (options.type === 'Primary') {
            if (item.AlbumId && item.AlbumPrimaryImageTag) {

                options.tag = item.AlbumPrimaryImageTag;
                return apiClient.getScaledImageUrl(item.AlbumId, options);
            }
        }

        return null;
    }

    /**
     * Retrieves a backdrop's image URL from the API.
     * @param {object} item - Item used to generate the image URL.
     * @param {object} options - Options of the image.
     * @param {object} apiClient - API client instance used to retrieve the image.
     * @returns {null|string} URL of the item's backdrop.
     */
    function getBackdropImageUrl(item, options, apiClient) {
        options = options || {};
        options.type = options.type || 'Backdrop';

        // If not resizing, get the original image
        if (!options.maxWidth && !options.width && !options.maxHeight && !options.height) {
            options.quality = 100;
        }

        if (item.BackdropImageTags && item.BackdropImageTags.length) {

            options.tag = item.BackdropImageTags[0];
            return apiClient.getScaledImageUrl(item.Id, options);
        }

        return null;
    }

    /**
     * Dispatches a request for an item's image to its respective handler.
     * @param {object} item - Item used to generate the image URL.
     * @returns {string} URL of the item's image.
     */
    function getImgUrl(item, user) {
        var apiClient = connectionManager.getApiClient(item.ServerId);
        var imageOptions = {};

        if (item.BackdropImageTags && item.BackdropImageTags.length) {
            return getBackdropImageUrl(item, imageOptions, apiClient);
        } else {
            if (item.MediaType === 'Photo' && user && user.Policy.EnableContentDownloading) {
                return apiClient.getItemDownloadUrl(item.Id);
            }
            imageOptions.type = 'Primary';
            return getImageUrl(item, imageOptions, apiClient);
        }
    }

    /**
     * Generates a button using the specified icon, classes and properties.
     * @param {string} icon - Name of the material icon on the button
     * @param {string} cssClass - CSS classes to assign to the button
     * @param {boolean} canFocus - Flag to set the tabindex attribute on the button to -1.
     * @param {boolean} autoFocus - Flag to set the autofocus attribute on the button.
     * @returns {string} The HTML markup of the button.
     */
    function getIcon(icon, cssClass, canFocus, autoFocus) {
        var tabIndex = canFocus ? '' : ' tabindex="-1"';
        autoFocus = autoFocus ? ' autofocus' : '';
        return '<button is="paper-icon-button-light" class="autoSize ' + cssClass + '"' + tabIndex + autoFocus + '><span class="material-icons slideshowButtonIcon ' + icon + '"></span></button>';
    }

    /**
     * Sets the viewport meta tag to enable or disable scaling by the user.
     * @param {boolean} scalable - Flag to set the scalability of the viewport.
     */
    function setUserScalable(scalable) {
        try {
            appHost.setUserScalable(scalable);
        } catch (err) {
            console.error('error in appHost.setUserScalable: ' + err);
        }
    }

    return function (options) {
        var self = this;
        /** Initialized instance of Swiper. */
        var swiperInstance;
        /** Initialized instance of the dialog containing the Swiper instance. */
        var dialog;
        /** Options of the slideshow components */
        var currentOptions;
        /** ID of the timeout used to hide the OSD. */
        var hideTimeout;
        /** Last coordinates of the mouse pointer. */
        var lastMouseMoveData;
        /** Visibility status of the OSD. */
        var _osdOpen = false;

        // Use autoplay on Chromecast since it is non-interactive.
        if (browser.chromecast) options.interactive = false;

        /**
         * Creates the HTML markup for the dialog and the OSD.
         * @param {Object} options - Options used to create the dialog and slideshow.
         */
        function createElements(options) {
            currentOptions = options;

            dialog = dialogHelper.createDialog({
                exitAnimationDuration: options.interactive ? 400 : 800,
                size: 'fullscreen',
                autoFocus: false,
                scrollY: false,
                exitAnimation: 'fadeout',
                removeOnClose: true
            });

            dialog.classList.add('slideshowDialog');

            var html = '';

            html += '<div class="slideshowSwiperContainer"><div class="swiper-wrapper"></div></div>';

            if (options.interactive && !layoutManager.tv) {
                var actionButtonsOnTop = layoutManager.mobile;

                html += getIcon('keyboard_arrow_left', 'btnSlideshowPrevious slideshowButton hide-mouse-idle-tv', false);
                html += getIcon('keyboard_arrow_right', 'btnSlideshowNext slideshowButton hide-mouse-idle-tv', false);

                html += '<div class="topActionButtons">';
                if (actionButtonsOnTop) {
                    if (appHost.supports('filedownload') && options.user && options.user.Policy.EnableContentDownloading) {
                        html += getIcon('file_download', 'btnDownload slideshowButton', true);
                    }
                    if (appHost.supports('sharing')) {
                        html += getIcon('share', 'btnShare slideshowButton', true);
                    }
                }
                html += getIcon('close', 'slideshowButton btnSlideshowExit hide-mouse-idle-tv', false);
                html += '</div>';

                if (!actionButtonsOnTop) {
                    html += '<div class="slideshowBottomBar hide">';

                    html += getIcon('play_arrow', 'btnSlideshowPause slideshowButton', true, true);
                    if (appHost.supports('filedownload') && options.user && options.user.Policy.EnableContentDownloading) {
                        html += getIcon('file_download', 'btnDownload slideshowButton', true);
                    }
                    if (appHost.supports('sharing')) {
                        html += getIcon('share', 'btnShare slideshowButton', true);
                    }

                    html += '</div>';
                }

            } else {
                html += '<div class="slideshowImage"></div><h1 class="slideshowImageText"></h1>';
            }

            dialog.innerHTML = html;

            if (options.interactive && !layoutManager.tv) {
                dialog.querySelector('.btnSlideshowExit').addEventListener('click', function (e) {
                    dialogHelper.close(dialog);
                });

                var btnPause = dialog.querySelector('.btnSlideshowPause');
                if (btnPause) {
                    btnPause.addEventListener('click', playPause);
                }

                var btnDownload = dialog.querySelector('.btnDownload');
                if (btnDownload) {
                    btnDownload.addEventListener('click', download);
                }

                var btnShare = dialog.querySelector('.btnShare');
                if (btnShare) {
                    btnShare.addEventListener('click', share);
                }
            }

            setUserScalable(true);

            dialogHelper.open(dialog).then(function () {
                setUserScalable(false);
            });

            inputManager.on(window, onInputCommand);
            document.addEventListener((window.PointerEvent ? 'pointermove' : 'mousemove'), onPointerMove);

            dialog.addEventListener('close', onDialogClosed);

            loadSwiper(dialog, options);
        }

        /**
         * Handles OSD changes when the autoplay is started.
         */
        function onAutoplayStart() {
            var btnSlideshowPause = dialog.querySelector('.btnSlideshowPause .material-icons');
            if (btnSlideshowPause) {
                btnSlideshowPause.classList.replace('play_arrow', 'pause');
            }
        }

        /**
         * Handles OSD changes when the autoplay is stopped.
         */
        function onAutoplayStop() {
            var btnSlideshowPause = dialog.querySelector('.btnSlideshowPause .material-icons');
            if (btnSlideshowPause) {
                btnSlideshowPause.classList.replace('pause', 'play_arrow');
            }
        }

        /**
         * Initializes the Swiper instance and binds the relevant events.
         * @param {HTMLElement} dialog - Element containing the dialog.
         * @param {Object} options - Options used to initialize the Swiper instance.
         */
        function loadSwiper(dialog, options) {
            var slides;
            if (currentOptions.slides) {
                slides = currentOptions.slides;
            } else {
                slides = currentOptions.items;
            }

            require(['swiper'], function (Swiper) {
                swiperInstance = new Swiper(dialog.querySelector('.slideshowSwiperContainer'), {
                    direction: 'horizontal',
                    // Loop is disabled due to the virtual slides option not supporting it.
                    loop: false,
                    zoom: {
                        minRatio: 1,
                        toggle: true,
                        containerClass: 'slider-zoom-container'
                    },
                    autoplay: !options.interactive,
                    keyboard: {
                        enabled: true
                    },
                    preloadImages: true,
                    slidesPerView: 1,
                    slidesPerColumn: 1,
                    initialSlide: options.startIndex || 0,
                    speed: 240,
                    navigation: {
                        nextEl: '.btnSlideshowNext',
                        prevEl: '.btnSlideshowPrevious'
                    },
                    // Virtual slides reduce memory consumption for large libraries while allowing preloading of images;
                    virtual: {
                        slides: slides,
                        cache: true,
                        renderSlide: getSwiperSlideHtml,
                        addSlidesBefore: 1,
                        addSlidesAfter: 1
                    }
                });

                swiperInstance.on('autoplayStart', onAutoplayStart);
                swiperInstance.on('autoplayStop', onAutoplayStop);
            });
        }

        /**
         * Renders the HTML markup of a slide for an item or a slide.
         * @param {Object} item - The item used to render the slide.
         * @param {number} index - The index of the item in the Swiper instance.
         * @returns {string} The HTML markup of the slide.
         */
        function getSwiperSlideHtml(item, index) {
            if (currentOptions.slides) {
                return getSwiperSlideHtmlFromSlide(item);
            } else {
                return getSwiperSlideHtmlFromItem(item);
            }
        }

        /**
         * Renders the HTML markup of a slide for an item.
         * @param {Object} item - Item used to generate the slide.
         * @returns {string} The HTML markup of the slide.
         */
        function getSwiperSlideHtmlFromItem(item) {
            return getSwiperSlideHtmlFromSlide({
                originalImage: getImgUrl(item, currentOptions.user),
                //title: item.Name,
                //description: item.Overview
                Id: item.Id,
                ServerId: item.ServerId
            });
        }

        /**
         * Renders the HTML markup of a slide for a slide object.
         * @param {Object} item - Slide object used to generate the slide.
         * @returns {string} The HTML markup of the slide.
         */
        function getSwiperSlideHtmlFromSlide(item) {
            var html = '';
            html += '<div class="swiper-slide" data-original="' + item.originalImage + '" data-itemid="' + item.Id + '" data-serverid="' + item.ServerId + '">';
            html += '<div class="slider-zoom-container">';
            html += '<img src="' + item.originalImage + '" class="swiper-slide-img">';
            html += '</div>';
            if (item.title || item.subtitle) {
                html += '<div class="slideText">';
                html += '<div class="slideTextInner">';
                if (item.title) {
                    html += '<h1 class="slideTitle">';
                    html += item.title;
                    html += '</h1>';
                }
                if (item.description) {
                    html += '<div class="slideSubtitle">';
                    html += item.description;
                    html += '</div>';
                }
                html += '</div>';
                html += '</div>';
            }
            html += '</div>';

            return html;
        }

        /**
         * Fetches the information of the currently displayed slide.
         * @returns {null|{itemId: string, shareUrl: string, serverId: string, url: string}} Object containing the information of the currently displayed slide.
         */
        function getCurrentImageInfo() {
            if (swiperInstance) {
                var slide = document.querySelector('.swiper-slide-active');

                if (slide) {
                    return {
                        url: slide.getAttribute('data-original'),
                        shareUrl: slide.getAttribute('data-original'),
                        itemId: slide.getAttribute('data-itemid'),
                        serverId: slide.getAttribute('data-serverid')
                    };
                }
                return null;
            } else {
                return null;
            }
        }

        /**
         * Starts a download for the currently displayed slide.
         */
        function download() {
            var imageInfo = getCurrentImageInfo();

            require(['fileDownloader'], function (fileDownloader) {
                fileDownloader.download([imageInfo]);
            });
        }

        /**
         * Shares the currently displayed slide using the browser's built-in sharing feature.
         */
        function share() {
            var imageInfo = getCurrentImageInfo();

            navigator.share({
                url: imageInfo.shareUrl
            });
        }

        /**
         * Starts the autoplay feature of the Swiper instance.
         */
        function play() {
            if (swiperInstance.autoplay) {
                swiperInstance.autoplay.start();
            }
        }

        /**
         * Pauses the autoplay feature of the Swiper instance;
         */
        function pause() {
            if (swiperInstance.autoplay) {
                swiperInstance.autoplay.stop();
            }
        }

        /**
         * Toggles the autoplay feature of the Swiper instance.
         */
        function playPause() {
            var paused = !dialog.querySelector('.btnSlideshowPause .material-icons').classList.contains('pause');
            if (paused) {
                play();
            } else {
                pause();
            }
        }

        /**
         * Closes the dialog and destroys the Swiper instance.
         */
        function onDialogClosed() {
            var swiper = swiperInstance;
            if (swiper) {
                swiper.destroy(true, true);
                swiperInstance = null;
            }

            inputManager.off(window, onInputCommand);
            document.removeEventListener((window.PointerEvent ? 'pointermove' : 'mousemove'), onPointerMove);
        }

        /**
         * Shows the OSD.
         */
        function showOsd() {
            var bottom = dialog.querySelector('.slideshowBottomBar');
            if (bottom) {
                slideUpToShow(bottom);
                startHideTimer();
            }
        }

        /**
         * Hides the OSD.
         */
        function hideOsd() {
            var bottom = dialog.querySelector('.slideshowBottomBar');
            if (bottom) {
                slideDownToHide(bottom);
            }
        }

        /**
         * Starts the timer used to automatically hide the OSD.
         */
        function startHideTimer() {
            stopHideTimer();
            hideTimeout = setTimeout(hideOsd, 3000);
        }

        /**
         * Stops the timer used to automatically hide the OSD.
         */
        function stopHideTimer() {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
        }

        /**
         * Shows the OSD by sliding it into view.
         * @param {HTMLElement} element - Element containing the OSD.
         */
        function slideUpToShow(element) {
            if (!element.classList.contains('hide')) {
                return;
            }

            _osdOpen = true;
            element.classList.remove('hide');

            var onFinish = function () {
                focusManager.focus(element.querySelector('.btnSlideshowPause'));
            };

            if (!element.animate) {
                onFinish();
                return;
            }

            requestAnimationFrame(function () {
                var keyframes = [
                    { transform: 'translate3d(0,' + element.offsetHeight + 'px,0)', opacity: '.3', offset: 0 },
                    { transform: 'translate3d(0,0,0)', opacity: '1', offset: 1 }
                ];
                var timing = { duration: 300, iterations: 1, easing: 'ease-out' };
                element.animate(keyframes, timing).onfinish = onFinish;
            });
        }

        /**
         * Hides the OSD by sliding it out of view.
         * @param {HTMLElement} element - Element containing the OSD.
         */
        function slideDownToHide(element) {
            if (element.classList.contains('hide')) {
                return;
            }

            var onFinish = function () {
                element.classList.add('hide');
                _osdOpen = false;
            };

            if (!element.animate) {
                onFinish();
                return;
            }

            requestAnimationFrame(function () {
                var keyframes = [
                    { transform: 'translate3d(0,0,0)', opacity: '1', offset: 0 },
                    { transform: 'translate3d(0,' + element.offsetHeight + 'px,0)', opacity: '.3', offset: 1 }
                ];
                var timing = { duration: 300, iterations: 1, easing: 'ease-out' };
                element.animate(keyframes, timing).onfinish = onFinish;
            });
        }

        /**
         * Shows the OSD when moving the mouse pointer or touching the screen.
         * @param {Event} event - Pointer movement event.
         */
        function onPointerMove(event) {
            var pointerType = event.pointerType || (layoutManager.mobile ? 'touch' : 'mouse');

            if (pointerType === 'mouse') {
                var eventX = event.screenX || 0;
                var eventY = event.screenY || 0;

                var obj = lastMouseMoveData;
                if (!obj) {
                    lastMouseMoveData = {
                        x: eventX,
                        y: eventY
                    };
                    return;
                }

                // if coord are same, it didn't move
                if (Math.abs(eventX - obj.x) < 10 && Math.abs(eventY - obj.y) < 10) {
                    return;
                }

                obj.x = eventX;
                obj.y = eventY;

                showOsd();
            }
        }

        /**
         * Dispatches keyboard inputs to their proper handlers.
         * @param {Event} event - Keyboard input event.
         */
        function onInputCommand(event) {
            switch (event.detail.command) {
                case 'up':
                case 'down':
                case 'select':
                case 'menu':
                case 'info':
                    showOsd();
                    break;
                case 'play':
                    play();
                    break;
                case 'pause':
                    pause();
                    break;
                case 'playpause':
                    playPause();
                    break;
                default:
                    break;
            }
        }

        /**
         * Shows the slideshow component.
         */
        self.show = function () {
            createElements(options);
        };

        /**
         * Hides the slideshow element.
         */
        self.hide = function () {
            if (dialog) {
                dialogHelper.close(dialog);
            }
        };
    };
});
