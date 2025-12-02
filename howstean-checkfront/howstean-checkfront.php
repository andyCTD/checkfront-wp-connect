<?php
/**
 * Plugin Name: How Stean Checkfront
 * Description: Custom inline Checkfront checkout with full booking form.
 * Version: 1.8.8
 * Author: How Stean Gorge
 */

wp_enqueue_style( 'checkfront-styles.css', plugins_url( '/assets/css/checkfront-styles.css', __FILE__ ), false, '1.0', 'all' ); // Inside a plugin

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Howstean_Checkfront_Plugin {

    const OPTION_KEY = 'howstean_checkfront_settings';

    private static $instance = null;
    private $api = null;

    public static function instance() {
        if ( self::$instance === null ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action( 'admin_menu', [ $this, 'add_admin_menu' ] );
        add_action( 'admin_init', [ $this, 'register_settings' ] );

        add_shortcode( 'checkfront_checkout', [ $this, 'checkout_shortcode' ] );

        add_action( 'rest_api_init', [ $this, 'register_rest_routes' ] );
    }

    /* ===== Settings helpers ===== */

    public function get_settings() {
        $defaults = [
            'host'       => '',
            'api_key'    => '',
            'api_secret' => '',
        ];
        $options = get_option( self::OPTION_KEY, [] );
        if ( ! is_array( $options ) ) {
            $options = [];
        }
        return array_merge( $defaults, $options );
    }

    public function get_api() {
        if ( $this->api === null ) {
            $settings  = $this->get_settings();
            $this->api = new Howstean_Checkfront_API(
                $settings['host'],
                $settings['api_key'],
                $settings['api_secret']
            );
        }
        return $this->api;
    }

    /* ===== Admin Settings ===== */

    public function add_admin_menu() {
        add_options_page(
            'How Stean Checkfront',
            'How Stean Checkfront',
            'manage_options',
            'howstean-checkfront',
            [ $this, 'settings_page' ]
        );
    }

    public function register_settings() {
        register_setting(
            'howstean_checkfront_group',
            self::OPTION_KEY
        );

        add_settings_section(
            'howstean_checkfront_main',
            'Checkfront API Settings',
            function () {
                echo '<p>Enter the Checkfront API host, key, and secret. Host should look like <code>https://howsteangorge.checkfront.co.uk</code>.</p>';
            },
            'howstean-checkfront'
        );

        add_settings_field(
            'host',
            'Checkfront Host URL',
            [ $this, 'field_host' ],
            'howstean-checkfront',
            'howstean_checkfront_main'
        );

        add_settings_field(
            'api_key',
            'API Key',
            [ $this, 'field_api_key' ],
            'howstean-checkfront',
            'howstean_checkfront_main'
        );

        add_settings_field(
            'api_secret',
            'API Secret',
            [ $this, 'field_api_secret' ],
            'howstean-checkfront',
            'howstean_checkfront_main'
        );
    }

    public function field_host() {
        $s = $this->get_settings();
        printf(
            '<input type="text" name="%1$s[host]" value="%2$s" class="regular-text" />',
            esc_attr( self::OPTION_KEY ),
            esc_attr( $s['host'] )
        );
    }

    public function field_api_key() {
        $s = $this->get_settings();
        printf(
            '<input type="text" name="%1$s[api_key]" value="%2$s" class="regular-text" />',
            esc_attr( self::OPTION_KEY ),
            esc_attr( $s['api_key'] )
        );
    }

    public function field_api_secret() {
        $s = $this->get_settings();
        printf(
            '<input type="password" name="%1$s[api_secret]" value="%2$s" class="regular-text" />',
            esc_attr( self::OPTION_KEY ),
            esc_attr( $s['api_secret'] )
        );
    }

    public function settings_page() {
        ?>
        <div class="wrap">
            <h1>How Stean Checkfront Settings</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields( 'howstean_checkfront_group' );
                do_settings_sections( 'howstean-checkfront' );
                submit_button();
                ?>
            </form>
        </div>
        <?php
    }

    /* ===== Shortcode & Frontend ===== */

    public function checkout_shortcode( $atts ) {
        $atts = shortcode_atts(
            [
                'item_id' => isset( $_GET['item_id'] ) ? sanitize_text_field( wp_unslash( $_GET['item_id'] ) ) : '',
            ],
            $atts,
            'checkfront_checkout'
        );

        if ( empty( $atts['item_id'] ) ) {
            return '<p><strong>No item selected.</strong> Please provide an <code>item_id</code> in the URL.</p>';
        }

        $handle = 'howstean-checkfront-js';
        wp_enqueue_script(
            $handle,
            plugin_dir_url( __FILE__ ) . 'assets/js/checkfront-booking.js',
            [],
            '1.8.8',
            true
        );

        $settings = $this->get_settings();

        wp_localize_script(
            $handle,
            'HowsteanCheckfront',
            [
                'restBase' => esc_url_raw( rest_url( 'checkfront/v1/' ) ),
                'nonce'    => wp_create_nonce( 'wp_rest' ),
                'hostUrl'  => esc_url_raw( $settings['host'] ),
            ]
        );

        ob_start();
        ?>
        <div id="howstean-checkfront-app"
             data-item-id="<?php echo esc_attr( $atts['item_id'] ); ?>">
        </div>
        <?php
        return ob_get_clean();
    }

    /* ===== REST API ===== */

    public function register_rest_routes() {
        register_rest_route(
            'checkfront/v1',
            '/item-rated',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'rest_get_item_rated' ],
                'permission_callback' => '__return_true',
            ]
        );

        register_rest_route(
            'checkfront/v1',
            '/create-booking',
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'rest_create_booking' ],
                'permission_callback' => '__return_true',
            ]
        );
    }

    public function rest_get_item_rated( WP_REST_Request $request ) {
        $item_id = intval( $request->get_param( 'item_id' ) );
        $date    = $request->get_param( 'date' );
        $end     = $request->get_param( 'end_date' );
        $qty     = intval( $request->get_param( 'qty' ) );

        if ( ! $item_id ) {
            return new WP_Error( 'missing_item', 'Item ID is required.', [ 'status' => 400 ] );
        }
        if ( empty( $date ) ) {
            return new WP_Error( 'missing_date', 'Date is required.', [ 'status' => 400 ] );
        }
        if ( $qty < 1 ) {
            return new WP_Error( 'missing_qty', 'At least one participant is required.', [ 'status' => 400 ] );
        }

        $api  = $this->get_api();
        $item = $api->get( 'item/' . $item_id );
        if ( is_wp_error( $item ) ) {
            $data   = $item->get_error_data();
            $status = is_array( $data ) && isset( $data['status'] ) ? intval( $data['status'] ) : 502;
            return new WP_Error( $item->get_error_code(), $item->get_error_message(), [ 'status' => $status ] );
        }
        if ( empty( $item['item'] ) ) {
            return new WP_Error( 'no_item', 'Unable to load item from Checkfront.', [ 'status' => 500 ] );
        }

        // Determine parameter name from rules (e.g. perperson).
        $param_name = 'perperson';
        if ( ! empty( $item['item']['rules'] ) ) {
            $rules = json_decode( $item['item']['rules'], true );
            if ( isset( $rules['param'] ) && is_array( $rules['param'] ) ) {
                $keys = array_keys( $rules['param'] );
                if ( ! empty( $keys ) ) {
                    $param_name = $keys[0];
                }
            }
        }

        $timestamp = strtotime( $date );
        if ( ! $timestamp ) {
            return new WP_Error( 'bad_date', 'Invalid date format.', [ 'status' => 400 ] );
        }

        $end_timestamp = $end ? strtotime( $end ) : $timestamp;
        if ( ! $end_timestamp ) {
            return new WP_Error( 'bad_end_date', 'Invalid end_date format.', [ 'status' => 400 ] );
        }
        if ( $end_timestamp <= $timestamp ) {
            $end_timestamp = strtotime( '+1 day', $timestamp );
        }

        $cf_date     = date( 'Ymd', $timestamp );
        $cf_end_date = date( 'Ymd', $end_timestamp );

        $params = [
            'start_date'                 => $cf_date,
            'end_date'                   => $cf_end_date,
            'param[' . $param_name . ']' => $qty,
        ];

        $rated = $api->get( 'item/' . $item_id, $params );
        if ( is_wp_error( $rated ) ) {
            $data   = $rated->get_error_data();
            $status = is_array( $data ) && isset( $data['status'] ) ? intval( $data['status'] ) : 502;
            return new WP_Error( $rated->get_error_code(), $rated->get_error_message(), [ 'status' => $status ] );
        }
        if ( ! empty( $item['item']['param'] ) && isset( $rated['item'] ) && empty( $rated['item']['param'] ) ) {
            $rated['item']['param'] = $item['item']['param'];
        }

        // Try to pull the booking form definition so the frontend can render fields exactly as Checkfront.
        $form_params = [
            'item_id'    => $item_id,
            'start_date' => $cf_date,
            'end_date'   => $cf_end_date,
        ];
        $form_response = $api->get( 'booking/form', $form_params );

        if ( is_wp_error( $form_response ) ) {
            // Keep the rated data but expose the error to the caller so the UI can surface it.
            $data   = $form_response->get_error_data();
            $status = is_array( $data ) && isset( $data['status'] ) ? intval( $data['status'] ) : 502;
            $rated['form_error'] = [
                'code'    => $form_response->get_error_code(),
                'message' => $form_response->get_error_message(),
                'status'  => $status,
            ];
        } elseif ( isset( $form_response['form'] ) ) {
            $fields = [];
            $form_fields = $form_response['form'];

            // Normalize arrays to keyed objects by field id so JS can iterate consistently.
            if ( is_array( $form_fields ) ) {
                foreach ( $form_fields as $field ) {
                    if ( isset( $field['id'] ) ) {
                        $fields[ $field['id'] ] = $field;
                    }
                }
            } elseif ( is_array( $form_response['booking']['form'] ?? null ) ) {
                foreach ( $form_response['booking']['form'] as $field ) {
                    if ( isset( $field['id'] ) ) {
                        $fields[ $field['id'] ] = $field;
                    }
                }
            }

            if ( ! empty( $fields ) ) {
                if ( empty( $rated['item']['param'] ) || ! is_array( $rated['item']['param'] ) ) {
                    $rated['item']['param'] = $fields;
                } else {
                    $rated['item']['param'] = array_merge( $rated['item']['param'], $fields );
                }
                $rated['item']['_booking_form'] = $fields;
            }
        }
        return rest_ensure_response( $rated );
    }

    public function rest_create_booking( WP_REST_Request $request ) {
        $params = $request->get_json_params();
        $slip   = '';
        if ( isset( $params['slip'] ) ) {
            if ( is_array( $params['slip'] ) ) {
                $slip = sanitize_text_field( reset( $params['slip'] ) );
            } else {
                $slip = sanitize_text_field( $params['slip'] );
            }
        }
        $form   = isset( $params['form'] ) && is_array( $params['form'] ) ? $params['form'] : [];

        // Normalized Terms of Service flag from multiple possible shapes
        $tos_flag = 0;
        if ( isset( $params['customer_tos_agree'] ) ) {
            $tos_flag = intval( $params['customer_tos_agree'] ) ? 1 : 0;
        } elseif ( isset( $form['customer_tos_agree'] ) ) {
            $tos_flag = intval( $form['customer_tos_agree'] ) ? 1 : 0;
        } elseif ( isset( $params['booking_policy']['customer_tos_agree'] ) ) {
            $tos_flag = intval( $params['booking_policy']['customer_tos_agree'] ) ? 1 : 0;
        }

        if ( empty( $slip ) ) {
            return new WP_Error( 'missing_slip', 'Missing SLIP parameter', [ 'status' => 400 ] );
        }

        $api = $this->get_api();

        // 1) Create booking session with the SLIP.
        $session_body     = [ 'slip[]' => $slip ];
        $session_response = $api->post( 'booking/session', $session_body );
        if ( is_wp_error( $session_response ) ) {
            return $session_response;
        }

        $session_id = null;
        if ( isset( $session_response['booking']['session']['id'] ) ) {
            $session_id = $session_response['booking']['session']['id'];
        } elseif ( isset( $session_response['booking']['session_id'] ) ) {
            $session_id = $session_response['booking']['session_id'];
        } elseif ( isset( $session_response['session_id'] ) ) {
            $session_id = $session_response['session_id'];
        }

        if ( empty( $session_id ) ) {
            return new WP_Error(
                'no_session',
                'Could not determine session_id from booking/session response',
                [ 'status' => 500, 'response' => $session_response ]
            );
        }

        // 2) Prepare form fields for booking/create using the dynamic fields returned by Checkfront.
        $form_fields = [];
        foreach ( $form as $key => $value ) {
            if ( '' === $value || null === $value ) {
                continue;
            }

            if ( 'customer_email' === $key ) {
                $form_fields[ $key ] = sanitize_email( $value );
            } else {
                $form_fields[ $key ] = is_scalar( $value ) ? sanitize_text_field( $value ) : '';
            }
        }

        $create_body = [
            'session_id'        => $session_id,
            // Top-level T&Cs field as used by the standard Checkfront iframe
            'customer_tos_agree' => $tos_flag,
            'form'              => $form_fields,
        ];

        $create_response = $api->post( 'booking/create', $create_body );

        if ( is_wp_error( $create_response ) ) {
            return $create_response;
        }

        $create_response['_session_id'] = $session_id;
        return rest_ensure_response( $create_response );
    }
}

class Howstean_Checkfront_API {

    private $host;
    private $api_key;
    private $api_secret;
    private $base_url;

    public function __construct( $host, $api_key, $api_secret ) {
        $this->host       = rtrim( $host, '/' );
        $this->api_key    = $api_key;
        $this->api_secret = $api_secret;
        $this->base_url   = $this->host ? $this->host . '/api/3.0/' : '';
    }

    private function headers() {
        if ( empty( $this->base_url ) ) {
            return [];
        }

        return [
            'Authorization' => 'Basic ' . base64_encode( $this->api_key . ':' . $this->api_secret ),
            'Accept'        => 'application/json',
            'X-On-Behalf'   => '3',
        ];
    }

    public function get( $path, $query = [] ) {
        if ( empty( $this->base_url ) ) {
            return new WP_Error( 'no_config', 'Checkfront API not configured.', [ 'status' => 500 ] );
        }

        $url = $this->base_url . ltrim( $path, '/' );
        if ( ! empty( $query ) ) {
            $url = add_query_arg( $query, $url );
        }

        $response = wp_remote_get(
            $url,
            [
                'timeout' => 20,
                'headers' => $this->headers(),
            ]
        );

        if ( is_wp_error( $response ) ) {
            return new WP_Error( $response->get_error_code(), $response->get_error_message(), [ 'status' => 502 ] );
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = wp_remote_retrieve_body( $response );
        $data = json_decode( $body, true );

        if ( $code >= 400 ) {
            return new WP_Error( 'api_error', 'Checkfront API error', [ 'status' => $code, 'body' => $data ] );
        }
        if ( null === $data ) {
            return new WP_Error( 'bad_json', 'Unable to decode Checkfront response', [ 'status' => 502, 'body' => $body ] );
        }

        return $data;
    }

    public function post( $path, $body = [] ) {
        if ( empty( $this->base_url ) ) {
            return new WP_Error( 'no_config', 'Checkfront API not configured.', [ 'status' => 500 ] );
        }

        $url = $this->base_url . ltrim( $path, '/' );

        $response = wp_remote_post(
            $url,
            [
                'timeout' => 20,
                'headers' => $this->headers(),
                'body'    => $body,
            ]
        );

        if ( is_wp_error( $response ) ) {
            return new WP_Error( $response->get_error_code(), $response->get_error_message(), [ 'status' => 502 ] );
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body_raw = wp_remote_retrieve_body( $response );
        $data     = json_decode( $body_raw, true );

        if ( $code >= 400 ) {
            return new WP_Error( 'api_error', 'Checkfront API error', [ 'status' => $code, 'body' => $data ] );
        }
        if ( null === $data ) {
            return new WP_Error( 'bad_json', 'Unable to decode Checkfront response', [ 'status' => 502, 'body' => $body_raw ] );
        }

        return $data;
    }
}

add_action(
    'plugins_loaded',
    function () {
        Howstean_Checkfront_Plugin::instance();
    }
);
